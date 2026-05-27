# Croft Error Handling & Reliability Audit — Section 4

**Date:** 2026-05-27
**Scope:** Trigger.dev job error handling, AI tier error paths, extraction write failures, sweeper recovery logic, server actions, Next.js error boundaries
**Method:** Full source read — all findings reference specific files and line numbers

---

## Summary

The core error handling story is solid. Tier 1 and Tier 2 never throw — they catch internally and return safe defaults so emails are never silently dropped. Tier 3 throws on failure, `classifyEmail` catches it and sets the email to `failed`, and the sweeper retries up to three times. Background jobs (synthesis, attachments, notifications) are all fired with `.catch()` so they cannot break classification. The sweeper is well-designed and covers all stuck states.

Three issues need fixing. One is user-facing and will look broken in production (no error boundaries). One is a silent data loss path (extraction write failures don't block marking the email as processed). One is a monitoring gap (room summary AI costs are completely invisible).

Six findings: one high, three medium, two low.

---

## HIGH

### H1 — No Next.js error boundaries anywhere in the app

There are no `error.tsx` files anywhere under `app/(app)/` or the top-level `app/` directory.

In Next.js App Router, when a Server Component throws an unhandled error during rendering — a failed Supabase query, a null dereference, anything — Next.js falls back to its own default error display. In development this shows a full stack trace. In production (`NODE_ENV=production`) it shows a generic "An error occurred" page with no recovery path and no way for the user to go back or refresh.

This will happen in production. Supabase queries can return unexpected null values, RLS can silently return no rows, and any query that assumes a non-null result (`.single()` on a missing row) throws when it gets back an empty response.

The fix is straightforward and takes minutes per route segment.

**Fix required:**
Create at minimum:
- `app/(app)/error.tsx` — catches errors in all authenticated app routes
- `app/error.tsx` — catches errors in top-level routes

Each file should be a `'use client'` component (required by Next.js) with a Reset button:

```tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <p>Something went wrong.</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

A `global-error.tsx` at the root is also worth adding for errors that escape the root layout.

---

## MEDIUM

### M1 — Extraction write failures silently produce a `processed` email with missing data

**File:** `lib/email/batch.ts`, `writeExtractionResults`, lines 237–385

Every write inside `writeExtractionResults` — job insert, contact upsert, job closure, asset insert — catches its own error, logs it, and continues. After `writeExtractionResults` returns, `classifyEmail` marks the email as `processed` regardless:

```ts
await supabase
  .from('emails')
  .update({
    processing_state: 'processed',
    subject_summary: result.subject_summary,
    extraction: result.extraction as unknown as Json,
    ...
  })
  .eq('id', emailId)
```

If the jobs insert fails (e.g. a schema mismatch, a constraint violation, a transient Supabase error), the email is marked `processed` with extraction data in the JSONB column, but no `jobs` rows exist. From the user's perspective, the email shows as classified but the cockpit has no jobs from it.

The error is logged to `console.error` but there is no Sentry capture, no state flag, and no user-visible signal. The email will never be retried — it is `processed`, and the sweeper ignores processed emails.

**Fix required:**
Two options:

Option A (minimal): capture Sentry errors on each failed write inside `writeExtractionResults` so they appear in the error tracker even if the email is still marked `processed`. This at least makes the failure observable.

Option B (stronger): if the jobs insert fails with a non-transient error, set `extraction_complete: false` on the email so it is flagged passively in the UI. The email is still `processed` (no retry storm), but the user sees the flag and can investigate.

---

### M2 — `generate-room-summary` has no token logging and no try/catch

**File:** `trigger/jobs/generate-room-summary.ts`, lines 125–136

The room summary task makes a `claude-sonnet-4-6` call with `max_tokens: 512` but writes nothing to `email_processing_log`. Every other AI call in the system (Tier 1, Tier 2, Tier 3, embeddings) logs input/output/cache tokens. This one does not.

At any meaningful volume, room summary calls accumulate non-trivial cost — each new email in a room triggers a summary regeneration. That cost is completely invisible in the cost dashboard and in any analytics derived from `email_processing_log`.

Additionally, the `client.messages.create` call at line 125 has no try/catch. If the Anthropic API returns an error (429, 500, timeout), the task throws and Trigger.dev handles the retry. This is functional but means the error is only visible in the Trigger.dev dashboard, not in application logs or Sentry.

**Fix required:**
Wrap the Anthropic call in a try/catch. In the success path, write a row to `email_processing_log` with `tier: 3`, `model: 'claude-sonnet-4-6'`, and token counts. In the error path, write the same row with `error` set and rethrow. This brings room summary calls into the existing cost tracking system with no schema changes needed.

---

### M3 — Sweeper uses `created_at` as a proxy for `processing_started_at`

**File:** `trigger/jobs/sweeper.ts`, lines 35–55

The sweeper resets emails stuck in `processing` state for more than 30 minutes. It identifies these by `created_at < processingCutoff` — meaning emails received more than 30 minutes ago that are still in `processing`:

```ts
const processingCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
...
.eq('processing_state', 'processing')
.lt('created_at', processingCutoff)
```

The sweeper comment acknowledges this: "Uses created_at as a proxy (the table has no processing_started_at column)."

The problem: an email received hours ago but only recently picked up by the batch processor (e.g. it was behind a large queue) will be reset by the sweeper as soon as it enters `processing` state, because `created_at` is already far past the 30-minute cutoff. If processing takes more than a few seconds and the sweeper fires in that window, the email is reset to `queued`, and the batch processor and sweeper fight over it. Repeated resets increment `processing_attempts` incorrectly, potentially exhausting the retry budget on an email that was never actually failing.

**Fix required:**
Add a `processing_started_at timestamptz` column to the `emails` table. Set it in `classifyEmail` when transitioning to `processing`. The sweeper should filter on `processing_started_at < processingCutoff` instead of `created_at`. This is a schema migration + one-line update in `batch.ts` + one-line filter change in `sweeper.ts`.

---

## LOW / INFORMATIONAL

### L1 — `noise-gate` and `urgency-scan` tasks have no local try/catch

**Files:** `trigger/jobs/noise-gate.ts`, `trigger/jobs/urgency.ts`

Neither task wraps its `run` function body in a try/catch. If `runNoiseGate` or `runUrgencyScan` threw an unhandled error (both functions catch internally so this is unlikely but possible — e.g. a Supabase connection failure before the AI call), Trigger.dev would catch the throw, mark the task run as failed, and retry automatically. The email would remain in `received` or `urgency_scanned` state and the sweeper would recover it within 5 minutes.

This is functionally safe, but errors are only visible in the Trigger.dev dashboard, not in Sentry and not in application logs. A sudden spike in noise-gate failures would require checking the Trigger.dev UI to diagnose, rather than being surfaced via alerting.

Low priority since the sweeper provides recovery and the functions themselves are robust.

---

### L2 — `fetch-body` state update is a guarded no-op

**File:** `trigger/jobs/fetch-body.ts`, lines 20–24

```ts
await supabase
  .from('emails')
  .update({ processing_state: 'received' })
  .eq('id', emailId)
  .eq('processing_state', 'received')
```

This updates `processing_state` to `received` only when it is already `received`. The net effect is a write that changes nothing. The intent appears to be ensuring the state is set before triggering noise-gate, but the email is already in `received` state when `fetch-body` runs (set by the webhook handler during ingest).

No functional harm — the write is a no-op and the `noiseGateTask.trigger` on the line after correctly advances the pipeline. But it's misleading: a reader would assume this transition is meaningful.

A minor cleanup: either remove the state update entirely (it does nothing) or change it to a meaningful transition — though at this point in the flow there is no appropriate intermediate state to set.

---

## What looked good

- Tier 1 defaults to `relevant: true` on any error — emails are never silently dropped
- Tier 2 defaults to `urgency_score: 5` on any error — conservative, not wrong
- Both Tier 1 and Tier 2 log to `email_processing_log` on both success and error paths
- Tier 3 throws on error, `classifyEmail` catches it, sets `failed`, and rethrows — clean error propagation
- All downstream post-classification jobs (synthesis, attachments, contact matching, notifications) are fired with `.catch()` — they cannot break classification state
- `writeNotifications` is called with `.catch()` explicitly — notification failures are logged and swallowed correctly
- Sweeper covers all four stuck states: `processing` (timeout), `failed` (retry budget), `received` (body not fetched), `urgency_scanned` (urgency not run)
- Sweeper retry budget (3 attempts) prevents infinite retry cycles on persistently broken emails
- Rate-limited emails are reset to `queued` (not `failed`) so they are retried automatically without burning the attempt budget
- `sendReply` uses a try/catch around `sendEmail` and only closes jobs after a confirmed successful send — jobs are never closed if the send fails
- `getReconciliationContext` wraps all four layers independently — a failure in the semantic layer never blocks thread or room context
- `candidateJobIds` validation prevents hallucinated IDs from closing real jobs even if the extraction write path has an error

---

## Priority order for fixes

1. H1 — Add `error.tsx` boundaries to the app — visible production breakage
2. M2 — Add token logging and try/catch to `generate-room-summary` — cost visibility
3. M1 — Capture Sentry errors on failed extraction writes, or set `extraction_complete: false`
4. M3 — Add `processing_started_at` column and use it in the sweeper cutoff check
5. L1 — Add try/catch to noise-gate and urgency-scan task run functions for Sentry capture
6. L2 — Remove the no-op state update in `fetch-body`
