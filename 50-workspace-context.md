# Brief 50: Workspace context

An optional onboarding step that lets the user describe what they do and the kinds of conversations they manage. Stored on the workspace. Fed into Tier 3 classification as user-message context so the model understands the professional domain from the first email processed.

---

## Why

Croft is industry-agnostic but starts blind. A user who tells us "I'm a construction PM managing subcontractor relationships and procurement" gets better room routing, better intent classification, and better fact keys from the very first batch run. The context costs a few tokens per Tier 3 call and improves accuracy across the board.

The context goes in the user message, not the system prompt. The system prompt must stay a static constant for prompt caching to work. Putting a per-workspace string there would give every workspace its own cache key and destroy caching at volume.

---

## Migration

File: `supabase/migrations/20260527000004_workspace_context.sql`

```sql
alter table workspaces
  add column if not exists workspace_context text;
```

No RLS change needed -- workspaces already has policies scoped to workspace members.

Tell Matt when the migration file is ready. He applies it and runs `pnpm types:gen` before any code that reads or writes `workspace_context` is touched.

---

## Onboarding flow change

Current flow: `/onboarding` (connect Gmail) -> `/onboarding/setup` (import wait) -> `/onboarding/processing` (watch rooms build)

New flow: `/onboarding` (connect Gmail) -> `/onboarding/context` (optional context step) -> `/onboarding/setup` -> `/onboarding/processing`

The context step sits after Gmail connect, before the import wait. The import runs in the background once Gmail is connected -- the user arriving at `/onboarding/context` does not delay that job.

### `/onboarding/context/page.tsx`

Server component. Requires auth. Redirects to `/onboarding/setup` if the workspace already has an email account but no `onboarding_complete` (handles page refresh / back nav).

Renders `ContextClient`.

### `/onboarding/context/context-client.tsx`

Client component.

UI:
- Heading: "Tell Croft what you do"
- Subheading: "Croft uses this to sort your email more accurately. You can change it any time in settings."
- `<textarea>` — placeholder: "e.g. I'm a venue booker managing contracts, show advances, and production riders across 40+ shows a year."
- Character limit: 500. Show count below textarea (e.g. "142 / 500"). Block submit above 500.
- Primary button: "Continue"
- Secondary link below: "Skip for now" (navigates to `/onboarding/setup`)

On "Continue": call `saveWorkspaceContext` server action, then navigate to `/onboarding/setup`.

The textarea value is optional. If the user clears it and clicks Continue, save an empty string (same as skip).

### Server action

`lib/workspaces/actions.ts` -- add:

```ts
export async function saveWorkspaceContext(context: string): Promise<void>
```

- Calls `requireUser()` and `getWorkspaceId()`
- Validates: `context.length <= 500` (Zod, `z.string().max(500)`)
- Updates `workspaces` set `workspace_context = context` where `id = workspaceId`
- No return value. Throws on error.

Add the Zod schema to `lib/validators/workspace.ts` (create file if it does not exist):

```ts
export const workspaceContextSchema = z.object({
  context: z.string().max(500),
})
```

### Redirect from `/onboarding`

After Gmail OAuth completes and the email account row exists, the existing redirect in `/onboarding/page.tsx` sends to `/onboarding/setup`. Change it to send to `/onboarding/context` instead.

Current line:
```ts
redirect('/onboarding/setup')
```

Change to:
```ts
redirect('/onboarding/context')
```

---

## Settings page

Add a "Your context" section to `/settings/page.tsx` (or the appropriate settings client component).

- Section heading: "Your context"
- Description: "Helps Croft classify your email more accurately."
- Same `<textarea>` as onboarding (500 char limit, live count)
- Populated from `workspace.workspace_context` on load
- Save button: calls `saveWorkspaceContext` server action
- Show a brief "Saved" confirmation inline after save (no toast needed, a text swap on the button is fine)

---

## Tier 3 integration

In `lib/ai/tier3.ts`, update `runFullClassification` and `runFirstPartyClassification` to accept an optional `workspaceContext` string parameter.

In `buildEmailContent`, add a new section at the top of `parts` (before the current email) when `workspaceContext` is present and non-empty:

```ts
if (workspaceContext?.trim()) {
  parts.unshift(`## Workspace context\n\n${workspaceContext.trim()}`)
}
```

This goes at the top so the model reads the professional frame before parsing the email.

### Passing context through to the call sites

Both call sites for `runFullClassification` need to fetch `workspace_context` and pass it in.

**Batch job** (`lib/email/batch.ts`): fetch `workspace_context` from the workspace row once before the loop (not per email -- one query, reused for every email in the batch).

**On-demand trigger** (server action that fires Tier 3 when user opens an email): fetch `workspace_context` from the workspace row and pass it in.

**First-party classification** (`runFirstPartyClassification` in tier3.ts, called from the first-party pipeline): same pattern.

Do not pass `workspace_context` to Tier 1 or Tier 2. The noise gate and urgency scan do not need it.

---

## Acceptance criteria

- [ ] Migration file written, Matt notified to apply
- [ ] `/onboarding/context` renders correctly, textarea limited to 500 chars
- [ ] "Skip for now" bypasses save and proceeds to `/onboarding/setup`
- [ ] "Continue" with content saves and proceeds
- [ ] "Continue" with empty textarea saves empty string (treated same as skip) and proceeds
- [ ] `/onboarding/page.tsx` redirects to `/onboarding/context` not `/onboarding/setup`
- [ ] Settings page shows and saves context
- [ ] `buildEmailContent` prepends workspace context section when non-empty
- [ ] Workspace context fetched once per batch, not per email
- [ ] No em-dashes in copy, code, or comments
- [ ] No industry-specific language in UI copy
