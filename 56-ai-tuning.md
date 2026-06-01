# Brief 56: AI Tuning — Reply Suggestion and Attachment Extraction

## Goal

Fix three specific AI quality issues that make Croft feel jarring in daily use:

1. Reply suggestions are generated for the user's own sent emails, producing nonsensical self-addressed drafts.
2. Open loops injected into reply drafts are scoped to the whole room, so unrelated jobs from other threads bleed into the draft.
3. Tier 3 has no explicit instruction about what to do with attachment content, causing inconsistent fact extraction from PDFs and other documents.

Also: rewrite the reply suggestion system prompt to match the actual professional context Croft operates in.

---

## Why

The reply suggestion screenshot showed a draft addressed to the user themselves, mixing in a job about Renee's immigration spreadsheet into an unrelated flight confirmation thread. Both failures have the same root cause: the function has no awareness of whether it is generating a reply to an inbound email or to the user's own sent email, and pulls open loops from the entire room rather than the current thread.

The attachment instruction gap matters because Croft already reads PDFs and document text before Tier 3 runs. The model receives the content but the system prompt gives it no instruction about how to treat it. Fact extraction from attachments is therefore inconsistent — sometimes excellent, sometimes thin — depending on how the model interprets the unlabelled sections.

These three fixes together remove the most visible AI quality issues before the first external user test.

---

## Non-negotiables

1. No em-dashes anywhere in code, copy, or comments.
2. `TIER_3_SYSTEM_PROMPT` must remain a static constant. No runtime concatenation.
3. The reply suggestion guard must run server-side, not client-side.
4. Thread-scoped jobs must degrade gracefully: if no thread_id exists on the email, scope to the current email only. Never fall back to the full room.
5. All model calls stay on the models specified in CLAUDE.md. Tier 3 stays claude-sonnet-4-6. Reply suggestion stays claude-haiku-4-5-20251001.

---

## What changes

1. Part 1: Self-reply guard in `generateReplySuggestion` and `getReplysuggestion`.
2. Part 2: Thread-scoped open loops in `generateReplySuggestion`.
3. Part 3: Attachment content instruction added to `TIER_3_SYSTEM_PROMPT`.
4. Part 4: Reply suggestion system prompt rewrite.

---

## Part 1 — Self-reply guard

### Step 1.1: Guard in generateReplySuggestion

In `lib/ai/reply-suggestion.ts`, `connectedAddresses` is already fetched via `getConnectedAddresses(workspaceId)` before any AI call. Add a guard immediately after that fetch:

```ts
const [connectedAddresses, roomEmailsResult] = await Promise.all([
  getConnectedAddresses(workspaceId),
  supabase.from('room_emails').select('email_id').eq('room_id', roomId),
])

// Do not generate a reply suggestion for the user's own sent emails.
// If the from_address is a connected address, this is an outbound email
// and replying to it makes no sense.
const connectedSet = new Set(connectedAddresses)
if (connectedSet.has(email.from_address)) return ''
```

Move the `const connectedSet = new Set(connectedAddresses)` line here (it currently appears later in the function -- remove the duplicate).

### Step 1.2: Guard in getReplysuggestion server action

In `app/(app)/rooms/[id]/actions/send-reply.ts`, `getReplysuggestion` currently passes straight through to `generateReplySuggestion`. Add a source check before the call:

```ts
export async function getReplysuggestion(
  emailId: string,
  roomId: string,
): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ''

  // Do not generate suggestions for the user's own sent emails.
  const { data: email } = await supabase
    .from('emails')
    .select('source')
    .eq('id', emailId)
    .single()

  if (email?.source === 'user_sent') return ''

  return generateReplySuggestion({ emailId, roomId })
}
```

This is a defence-in-depth check. The guard in Step 1.1 catches the case at the function level; this catches it at the server action level before the function is even called.

---

## Part 2 — Thread-scoped open loops

### Step 2.1: Fetch thread email IDs

In `generateReplySuggestion`, the jobs query currently uses `emailIds` — every email in the room. Replace that query with one scoped to the current thread only.

Add this block after the guard from Part 1, before the `Promise.all` that fetches thread history, jobs, room data, and assets:

```ts
// Scope open loops to the current thread only.
// If the email has no thread_id, scope to just this email.
// Never fall back to all room emails -- that causes jobs from
// unrelated threads to bleed into the draft.
let threadEmailIds: string[] = [emailId]

if (email.thread_id) {
  const { data: threadEmails } = await supabase
    .from('emails')
    .select('id')
    .eq('thread_id', email.thread_id)
    .eq('workspace_id', workspaceId)

  if (threadEmails && threadEmails.length > 0) {
    threadEmailIds = threadEmails.map((e) => e.id)
  }
}
```

### Step 2.2: Scope jobs query to threadEmailIds

Replace the existing jobs query in the `Promise.all`:

```ts
// Before (room-wide):
emailIds.length > 0
  ? supabase
      .from('jobs')
      .select('description, owner, due')
      .in('email_id', emailIds)
      .eq('status', 'open')
  : Promise.resolve({ data: [] })

// After (thread-scoped):
supabase
  .from('jobs')
  .select('description, owner, due')
  .in('email_id', threadEmailIds)
  .eq('status', 'open')
```

The `emailIds` variable (all room email IDs) is still needed for the assets query. Keep that fetch. Only the jobs query changes.

### Step 2.3: Limit open loops in the user message

The reply draft currently includes all open loops matching the user's connected addresses. Cap this at 5, ordered by due date ascending (soonest first, nulls last):

```ts
const openLoops = allJobs
  .filter((j) => j.owner != null && connectedSet.has(j.owner))
  .sort((a, b) => {
    if (!a.due && !b.due) return 0
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due.localeCompare(b.due)
  })
  .slice(0, 5)
```

---

## Part 3 — Attachment content instruction in Tier 3

### Step 3.1: Add section to TIER_3_SYSTEM_PROMPT

In `lib/ai/prompts.ts`, add the following section to `TIER_3_SYSTEM_PROMPT` immediately before the `## Facts` section:

```
## Attachment content

When attachment text is provided in the email content (marked as `## Attachment: [filename]`), treat it as a primary source for facts and jobs. Extract from attachments with the same thoroughness as from the email body.

Specific rules for attachment content:

Technical documents (riders, specifications, process books, schedules): extract every measurable specification, dimension, format requirement, deadline, and technical constraint as a fact. These documents exist precisely because the project depends on these details. Do not summarise -- extract each spec as its own fact with a precise key.

Budget and financial documents (spreadsheets, pro-formas, invoices): extract line items, totals, unit costs, quantities, and any referenced dates. Use `kind: money` for amounts and `kind: time` for dates. If a budget has empty or zero-value line items, do not extract them as facts -- a missing value is not a fact.

Contracts and agreements: extract parties, dates, obligations, and any specific quantities or deadlines. Mark obligations as REQUEST jobs owned by the appropriate party where the contract creates a clear action item.

For the `category` field of facts extracted from attachments: use the document's subject matter as the category (for example `video production` for facts from a video process book, `travel` for a travel itinerary). Use the attachment filename as context to determine category when the content alone is ambiguous.

Jobs can be extracted from attachment content as well as email body text. A document that contains deadlines, submission requirements, or explicit requests creates open jobs for the appropriate owner.

Epistemic status for attachments: facts from well-structured technical or financial documents carry high confidence. Facts from scanned or OCR-processed documents carry lower confidence -- reflect this in the confidence field.
```

This section goes in the system prompt and is therefore cached. It does not change at runtime. The attachment text itself arrives in the user message and is not cached -- the instruction is what matters here.

### Step 3.2: No schema changes

The extraction schema already supports all the fact fields needed. No changes to `EXTRACTION_TOOL_SCHEMA`.

---

## Part 4 — Reply suggestion system prompt rewrite

### Step 4.1: Move REPLY_SYSTEM_PROMPT to prompts.ts

Move `REPLY_SYSTEM_PROMPT` from `lib/ai/reply-suggestion.ts` into `lib/ai/prompts.ts` as a named export. Import it in reply-suggestion.ts.

```ts
// In lib/ai/prompts.ts:
export const REPLY_SUGGESTION_SYSTEM_PROMPT = `...`

// In lib/ai/reply-suggestion.ts:
import { REPLY_SUGGESTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
```

### Step 4.2: Rewrite the prompt

Replace the existing 11-line prompt with the following:

```
You are helping a project professional draft a reply to an email. They manage projects over email -- shows, tours, charters, contracts, events, builds. Their emails are direct, short, and professional. Their counterparts are suppliers, venues, promoters, coordinators, and crew.

Draft the most useful reply given the context. Match the register of the conversation.

Rules:
- Under 80 words. Shorter is better.
- Active voice. Plain English.
- If the sender asked a direct question: answer it. If the answer is not in the context, do not guess -- write a holding reply that buys time.
- If the sender asked for a document that exists in the available assets list: confirm it will be attached. Do not fabricate documents that are not in the list.
- If there are open items on your side listed in the context: address the most urgent one only. Do not list all of them.
- If this email is a straightforward acknowledgement with nothing to respond to: return an empty string rather than drafting filler.
- Do not repeat information the recipient already knows.
- No pleasantries beyond "Hi [first name]" where appropriate.
- Close with the user's first name only ("Matt", "Jo", etc.) derived from the connected address if available. Do not add job titles or company names.
- No em-dashes. Use commas, colons, or a new sentence.
- Do not mention Croft.
- Plain text only. No markdown, no bullet points.
```

### Step 4.3: Add workspace context slot to user message

When Brief 50 (workspace context) is built, the reply suggestion should receive it. Prepare the slot now so Brief 50 can wire it in without touching the system prompt.

In `generateReplySuggestion`, add an optional `workspaceContext` parameter:

```ts
export async function generateReplySuggestion(params: {
  emailId: string
  roomId: string
  workspaceContext?: string | null
}): Promise<string>
```

In the user message assembly, insert the context if present:

```ts
params.workspaceContext
  ? `\nWorkspace context: ${params.workspaceContext}`
  : '',
```

Place it immediately after the thread context block and before open loops. This is in the user message, not the system prompt, so the cache is not affected.

Brief 50 will wire in the fetch and pass the value. For now the slot accepts undefined/null and produces no output.

---

## File locations

```
lib/ai/prompts.ts                   -- REPLY_SUGGESTION_SYSTEM_PROMPT added, attachment instruction added to TIER_3_SYSTEM_PROMPT (modified)
lib/ai/reply-suggestion.ts          -- self-reply guard, thread-scoped jobs, workspaceContext slot, import REPLY_SUGGESTION_SYSTEM_PROMPT (modified)
app/(app)/rooms/[id]/actions/send-reply.ts   -- user_sent guard in getReplysuggestion (modified)
```

No new files. No migrations. No schema changes. No new packages.

---

## Acceptance criteria

- [ ] `generateReplySuggestion` returns an empty string when `email.from_address` is in `connectedAddresses`
- [ ] `getReplysuggestion` returns an empty string without calling `generateReplySuggestion` when `email.source === 'user_sent'`
- [ ] Opening the compose area on a sent email produces no AI draft suggestion
- [ ] Open loops in the draft are scoped to emails in the same thread as the current email
- [ ] If the email has no `thread_id`, open loops are scoped to the current email only
- [ ] Open loops never fall back to all room email IDs
- [ ] Open loops in the draft are capped at 5, sorted by due date ascending, nulls last
- [ ] A job from an unrelated thread does not appear in the draft for the current thread
- [ ] `TIER_3_SYSTEM_PROMPT` contains an `## Attachment content` section before `## Facts`
- [ ] The attachment instruction is a static string addition -- no runtime concatenation
- [ ] Facts extracted from a technical rider PDF include individual spec lines, not summaries
- [ ] Facts extracted from a budget spreadsheet use `kind: money` for amounts and `kind: time` for dates
- [ ] Empty or zero-value budget line items are not extracted as facts
- [ ] `REPLY_SUGGESTION_SYSTEM_PROMPT` is defined in `lib/ai/prompts.ts` and imported in `reply-suggestion.ts`
- [ ] The rewritten prompt is under 250 words
- [ ] A draft for a document request references only assets present in the available assets list
- [ ] A draft for a pure acknowledgement email returns an empty string
- [ ] `generateReplySuggestion` accepts an optional `workspaceContext` parameter
- [ ] When `workspaceContext` is null or undefined, the user message is unchanged
- [ ] No em-dashes in any modified file
