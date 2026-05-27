# Croft AI Pipeline Audit — Section 2: AI Pipeline

**Date:** 2026-05-27
**Scope:** Tier 1, 2, 3 functions, embedding generation, batch processing, state machine, token logging, Trigger.dev jobs, reconciliation context
**Method:** Full source read — all findings reference specific files and line numbers

---

## Summary

The pipeline logic is substantially correct. Tool use is enforced for all three tiers, the schema is validated, prompt caching is implemented, and token logging runs on every call including errors. The reconciliation context (thread, room, semantic, watch context) is well-designed.

Four findings are high: two are explicit CLAUDE.md rule violations that appear to have been made deliberately for architectural reasons, and two are correctness issues. All are worth confirming before the next batch processing run at scale.

---

## HIGH

### H1 — Embedding model is `voyage-3`, not `voyage-3-lite`

**File:** `lib/ai/embeddings.ts`, line 24

CLAUDE.md states: **"Embeddings: voyage-3-lite only"**

The code uses:
```ts
const response = await voyage.embed({
  input: buildEmbeddingInput(email),
  model: 'voyage-3',
})
```

`voyage-3` is the full model. It costs more per token than `voyage-3-lite`. Both produce 1024-dimensional embeddings, so the database schema is compatible either way. But the CLAUDE.md rule is explicit and the model selection is wrong.

**Fix required:**
Change `model: 'voyage-3'` to `model: 'voyage-3-lite'` in `lib/ai/embeddings.ts`.

---

### H2 — Embedding is generated synchronously before Tier 3, violating two CLAUDE.md rules

**File:** `lib/email/batch.ts`, lines 44–50

CLAUDE.md states:
- "Never block Tier 3 completion on embedding generation"
- "Do not generate embeddings synchronously — always enqueue as a background job"

The actual code:
```ts
// Generate and store the embedding before classification
try {
  embedding = await generateEmbedding(email)
  await supabase.from('emails').update({ embedding: ... }).eq('id', emailId)
} catch (err) {
  console.error(`classifyEmail: embedding failed for ${emailId}:`, err)
}
```

This is synchronous, happens before Tier 3 runs, and adds Voyage AI latency to every classification. The comment explains the rationale: the embedding is used by `getReconciliationContext` for Layer 3 semantic search, so it must exist before `runFullClassification` is called. The `trigger/jobs/embed.ts` task exists but is never triggered from the main path — it is dead code.

This is an architectural decision that directly contradicts two CLAUDE.md rules. The trade-off is real: generating the embedding before Tier 3 enables better reconciliation context (semantically similar past jobs surface), at the cost of added latency and coupling. Whether this trade-off was intentional needs confirming.

If kept as-is:
- The `embed.ts` Trigger.dev task should be removed or its purpose documented, as it creates confusion about where embeddings are generated
- The CLAUDE.md should be updated to reflect the actual architecture

If the rule is to be enforced:
- The embedding must move to a post-classification background job
- Layer 3 semantic context would need to use the previous email's embedding (or be skipped on first classification)

**Action required: confirm which architecture is intended.**

---

### H3 — Batch processing runs concurrent workers, not strictly sequential per workspace

**File:** `lib/email/process-queue.ts`, lines 173–174; `lib/email/batch.ts`, line 19 comment

CLAUDE.md states: **"Tier 3 batch jobs process emails sequentially within a workspace, not in parallel."** Reason given: "Sequential processing means each email in the batch reuses the same cached system prompt. Parallel processing would spawn independent calls that each start with a cold cache, destroying the cost saving."

The actual code groups emails by `(workspace_id, thread_id)` and processes groups concurrently (default `CLASSIFY_CONCURRENCY = 3`):

```ts
const workerCount = Math.min(throttle.effectiveConcurrency, groups.length)
await Promise.all(Array.from({ length: workerCount }, () => worker()))
```

Within each group (same thread), emails are sequential. But two emails from different threads in the same workspace can process simultaneously.

The CLAUDE.md's stated concern about parallel processing "destroying the cost saving" is technically overstated: Anthropic's prompt cache lives server-side. Once created by the first call in a batch, subsequent parallel calls immediately read from it. The cold-cache cost hits only the very first email of a batch, not each parallel worker.

That said, the rule is being violated. The current design is intentional and defensible on performance grounds, but it should be explicitly approved and the CLAUDE.md updated.

**Action required: confirm the concurrent-group design is intentional and update CLAUDE.md accordingly.**

---

### H4 — Race condition: `classify-now` and the batch worker can double-process the same email

**Files:** `trigger/jobs/classify-now.ts`, lines 19–33; `lib/email/batch.ts`, lines 27–30

The on-demand job reads `processing_state`, checks if it is `queued` or `urgency_scanned`, and then proceeds:

```ts
const { data: email } = await supabase
  .from('emails')
  .select('processing_state')
  .eq('id', emailId)
  .single()

if (!['queued', 'urgency_scanned'].includes(email.processing_state)) {
  return { emailId, skipped: true, reason: email.processing_state }
}

await classifyEmail(emailId)  // sets processing_state to 'processing' inside classifyEmail
```

Inside `classifyEmail` (batch.ts line 28), the state is set to `processing`. But there is a read-then-write gap between the `select` check and the `update`. If the batch processor claims the email in that window, both proceed. The result is duplicate jobs written to the database, potentially duplicate room filings, and duplicate token log entries.

The fix is to make the claim atomic: attempt the state transition in the database and check whether it succeeded before proceeding.

**Fix required:**
Replace the read-check-then-classify pattern in `classify-now.ts` with an atomic claim. The state update in `classifyEmail` should similarly be conditional:

```ts
// In classify-now.ts, replace the read + check with:
const { data: claimed, error } = await supabase
  .from('emails')
  .update({ processing_state: 'processing' })
  .eq('id', emailId)
  .in('processing_state', ['queued', 'urgency_scanned'])
  .select('id')
  .single()

if (!claimed || error) {
  return { emailId, skipped: true, reason: 'claimed_by_other_worker' }
}

// Then call classifyEmail, but skip the redundant processing_state update at the top of it
```

This same pattern should be applied at the top of `classifyEmail` in `batch.ts` to protect the batch path too.

---

## MEDIUM

### M1 — `processing_state` set to `processing` before the email row is confirmed to exist

**File:** `lib/email/batch.ts`, lines 27–39

```ts
await supabase
  .from('emails')
  .update({ processing_state: 'processing' })
  .eq('id', emailId)

const { data: email } = await supabase
  .from('emails')
  .select('*')
  .eq('id', emailId)
  .single()

if (!email) throw new Error(`classify: email ${emailId} not found`)
```

If the email somehow does not exist (a bad ID, a deletion race), the state update runs against a non-existent row (a no-op in Postgres), then the error is thrown. The email ends up not existing, so the state is not actually set — but the error still propagates. In practice this means no stuck state, just a failed job.

More subtly: if the email does exist but the `select` fails (transient error), the state is set to `processing` but the email is never marked `failed` because the `catch` branch at the bottom of `classifyEmail` catches the error and sets `failed` — on the same `emailId`. So this specific case actually handles correctly.

The ordering is still architecturally odd. Setting state before reading the row means there is a brief window where the state says `processing` but the job hasn't started real work. Swap the read and write so we only set `processing` after confirming the email exists.

---

### M2 — `embed.ts` Trigger.dev task is dead code

**File:** `trigger/jobs/embed.ts`

The `embedTask` is a fully implemented Trigger.dev job that fetches an email and generates an embedding. It is never triggered from the main processing path (`batch.ts`, `process-queue.ts`, or any of the tier jobs). Embedding is now generated inline in `classifyEmail`.

This creates real confusion: a developer looking at the jobs list would reasonably assume embedding happens in `embed.ts`. The actual embedding path is `lib/ai/embeddings.ts` called from `lib/email/batch.ts`.

**Fix required:**
Either remove `embed.ts` entirely, or add a clear comment explaining it is unused and the embedding now runs inline. If H2 above results in embeddings being moved back to a background job, `embed.ts` would be the right place to restore that.

---

## LOW / INFORMATIONAL

### L1 — Cache token cast pattern is inconsistent between tiers

**Files:** `lib/ai/tier1.ts` lines 72–73, `tier2.ts` lines 101–102 vs `lib/ai/tier3.ts` lines 209–211

Tier 1 and Tier 2 cast inline:
```ts
cache_read_tokens: (response.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number ?? 0,
```

Tier 3 extracts to named variables first, which is cleaner and easier to read. A minor inconsistency, but since the pattern needs updating when the Anthropic SDK adds native typing for these fields, consistency makes that easier.

---

### L2 — VIP sender urgency reason can be misleading

**File:** `lib/ai/tier2.ts`, lines 90–93

```ts
if (vip && result.urgency_score < 8) {
  result.urgency_score = 8
  result.urgency_reason = `VIP sender. ${result.urgency_reason}`
}
```

If the model originally scored an email a 3 with the reason "This appears to be a routine update with no action required", the stored reason becomes "VIP sender. This appears to be a routine update with no action required." The second half contradicts the score. Low impact since the urgency_reason is a logging/display field, but could confuse users seeing it in the UI.

---

### L3 — `classify-now` state guard does not handle `urgency_scanned` state correctly

**File:** `trigger/jobs/classify-now.ts`, lines 29–33

```ts
if (!['queued', 'urgency_scanned'].includes(email.processing_state)) {
  return { emailId, skipped: true, reason: email.processing_state }
}
```

`urgency_scanned` is included as a valid state to proceed from. But `urgency_scanned` precedes `queued` in the state machine. An email in `urgency_scanned` hasn't yet completed Tier 2 writes (urgency_score, requires_response, response_by). If `classify-now` fires on a `urgency_scanned` email, Tier 3 classification proceeds without urgency data, which is fine — urgency is Tier 2 output and not used by Tier 3. But it skips the `queued` state, which violates the state machine sequence.

The CLAUDE.md state machine is: `received -> urgency_scanned -> queued -> processing -> processed`. On-demand classification jumping from `urgency_scanned` directly to `processing` skips `queued`. At low volume this is invisible, but if the sweeper or any query filters by `queued`, these emails would be invisible to it.

**Recommendation:** Either restrict `classify-now` to only `queued` state, or explicitly document the `urgency_scanned` bypass and ensure the sweeper and queue queries also cover `urgency_scanned`.

---

## What looked good

- Tier 1 defaults to `relevant: true` on error — emails are never silently dropped by a transient AI failure
- Tier 2 defaults to `urgency_score: 5` on error — conservative, not catastrophically wrong
- Tool use is enforced (`tool_choice: { type: 'tool', name: '...' }`) on all three tiers — the model cannot return free text
- `closes_jobs` and `relates_to_job_id` are validated against `candidateJobIds` before acting — hallucinated IDs cannot close real jobs
- DELIVER and CONFIRM jobs are explicitly skipped at write time regardless of what the model returns — the safety net is in the writer, not just the prompt
- Prompt caching is implemented correctly on all three tiers with `cache_control: { type: 'ephemeral' }` on the system prompt
- `TIER_3_SYSTEM_PROMPT` is a static constant in `lib/ai/prompts.ts` — the cache key never changes between calls
- Token logging runs on both success and error paths in all three tiers and embeddings
- Rate limit headers are read and respected: the process-queue backs off when `tokensRemaining` drops below the floor
- Rate-limited emails are reset to `queued` (not `failed`) so they are retried automatically
- The `concurrencyLimit: 1` on `processQueuedEmailsTask` ensures at most one batch run globally at a time
- `candidateJobIds` deduplication across thread, room, and semantic layers is correct
- The `EXTRACTION_TOOL_SCHEMA` is defined as a `const` assertion — no runtime mutation possible
- First-party classification (`runFirstPartyClassification`) uses a separate system prompt and correctly logs under `tier: 3`

---

## Priority order for fixes

1. H1 — Fix embedding model name (`voyage-3` → `voyage-3-lite`) — one word change
2. H4 — Atomic email claim in both `classify-now` and `classifyEmail` — correctness fix
3. H2 — Confirm embedding architecture intent, update CLAUDE.md or move to background job
4. H3 — Confirm concurrent batch processing is intentional, update CLAUDE.md
5. M1 — Swap email existence check before state update in `classifyEmail`
6. M2 — Remove or document `embed.ts` dead code task
7. L3 — Decide whether `classify-now` should allow `urgency_scanned` or restrict to `queued` only
