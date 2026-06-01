# Brief 56: Close job with note

## What and why

Jobs can only be closed today via an email reply or AI auto-detection. But work gets resolved off-email all the time — a phone call, a WhatsApp, a conversation in the room. There's no way to mark a job done in those cases, and no way to leave a record of how it was handled.

This brief adds:
1. "Close job" to the three-dot dropdown on every open job row
2. A small dialog asking for an optional note (e.g. "David confirmed on a call")
3. The note appears in the job's activity timeline in "View details"

---

## Schema

New migration: `supabase/migrations/20260601000001_job_events.sql`

```sql
create table job_events (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references workspaces(id) on delete cascade,
  job_id       uuid        not null references jobs(id) on delete cascade,
  type         text        not null check (type in ('noted', 'manually_closed', 'reopened')),
  note         text,
  created_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

alter table job_events enable row level security;

create policy "workspace members can read job_events"
  on job_events for select
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "workspace members can insert job_events"
  on job_events for insert
  with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- Append-only. No update or delete policies.
```

Write this file. Tell Matt it's ready. Do not proceed with any code that references `job_events` until Matt has applied the migration and run `pnpm types:gen`.

---

## After migration: code changes

### 1. New API route — `app/api/jobs/[id]/close/route.ts`

POST handler. Takes optional `{ note?: string }` in the request body.

Steps:
1. Call `auth.getUser()` — 401 if no session
2. Fetch the job, verify it belongs to a workspace the user is a member of — 403 if not
3. In a single Supabase transaction (or two sequential writes, both must succeed):
   a. Insert a row into `job_events`: `type = 'manually_closed'`, `note` from body (null if omitted), `created_by = user.id`, `workspace_id`, `job_id`
   b. Update `jobs`: `status = 'closed'`, `closed_at = now()`, `updated_at = now()`. Leave `closed_by_email_id` as null — null means manually closed.
4. Return 200 `{ ok: true }`

Do not set `closed_by_email_id`. Null on that column is how downstream code distinguishes manual from email-sourced closes.

---

### 2. Type changes — `lib/queries/job-activity.ts`

`JobActivityEvent` gains two fields and `emailId` becomes nullable:

```ts
export interface JobActivityEvent {
  type: 'created' | 'chased' | 'updated' | 'closed' | 'manually_closed' | 'noted'
  emailId: string | null   // null for manual events
  fromName: string | null
  fromAddress: string | null   // null for manual events
  subjectSummary: string | null
  receivedAt: string
  note: string | null      // populated for manually_closed and noted events
}
```

In `getJobActivity`, after building the email-sourced timeline, add a second query:

```ts
const { data: manualEvents } = await supabase
  .from('job_events')
  .select('id, type, note, created_at, created_by')
  .eq('job_id', jobId)
  .order('created_at', { ascending: true })
```

For each manual event, fetch the user's display name from `auth.users` or `workspace_members` if you have a profiles table. If no display name is available, leave `fromName` null.

Map each to a `JobActivityEvent`:
```ts
{
  type: event.type,         // 'manually_closed' | 'noted'
  emailId: null,
  fromName: userName ?? null,
  fromAddress: null,
  subjectSummary: null,
  receivedAt: event.created_at,
  note: event.note ?? null,
}
```

Merge with the email-sourced array and re-sort by `receivedAt` ascending.

The `note` field on email-sourced events is always null.

---

### 3. Timeline rendering — `components/job-modal/job-modal.tsx`

**`EventIcon`** — add cases:
- `manually_closed`: use `PhoneCall` from lucide-react
- `noted`: use `MessageSquare` from lucide-react

**`eventLabel`** — add cases:
- `manually_closed`: `'Marked done'`
- `noted`: `'Note'`

**`TimelineEvent`** — two changes:

a. The `key` prop in the map loop currently uses `event.emailId + event.type`. Change it to use the array index or a stable generated key, since `emailId` can now be null.

b. Render the note when present, above the "View email" button:
```tsx
{event.note && (
  <p className="text-sm text-foreground leading-snug mb-2 italic">
    "{event.note}"
  </p>
)}
```

c. Only render the "View email" button when `event.emailId` is not null.

d. For manual events with no `fromAddress`, the `fromAddress` line renders the user's name only (or nothing if both are null).

---

### 4. New component — `components/jobs/close-job-dialog.tsx`

A controlled dialog (uses shadcn `Dialog`). Props:

```ts
interface CloseJobDialogProps {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onClosed: () => void   // called after successful close, so parent can refresh
}
```

Layout:
- `DialogTitle`: "Mark as done"
- Optional sub-text (small, muted): "Leave a note about how this was resolved."
- Textarea: placeholder `"e.g. David confirmed on a call, Phil responded on WhatsApp…"` — not required
- Footer: Cancel (ghost) | **Mark done** (primary)

On submit:
1. Set a loading state on the button
2. `POST /api/jobs/{jobId}/close` with `{ note: value || undefined }`
3. On success: call `onClosed()`, close the dialog
4. On error: show inline error text, leave dialog open

---

### 5. Job row — `components/jobs/job-row.tsx`

Import `CloseJobDialog` and add local state:
```ts
const [closeDialogOpen, setCloseDialogOpen] = useState(false)
```

In the dropdown, add a second item — only render it when the job is open:
```tsx
{!isClosed && (
  <DropdownMenuItem
    onClick={(e) => {
      e.stopPropagation()
      setCloseDialogOpen(true)
    }}
  >
    Close job
  </DropdownMenuItem>
)}
```

Render the dialog below the dropdown:
```tsx
<CloseJobDialog
  jobId={job.id}
  open={closeDialogOpen}
  onOpenChange={setCloseDialogOpen}
  onClosed={() => {
    setCloseDialogOpen(false)
    // The parent list will refresh via Realtime — no manual reload needed
  }}
/>
```

The job row itself does not need to re-fetch anything. The room view already listens to Supabase Realtime job status changes and will update when `jobs.status` flips to `closed`.

---

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/20260601000001_job_events.sql` | New — write this first, wait for Matt to apply |
| `app/api/jobs/[id]/close/route.ts` | New |
| `lib/queries/job-activity.ts` | Extend types, add manual event query |
| `components/job-modal/job-modal.tsx` | Handle new event types, conditional "View email", render note |
| `components/jobs/close-job-dialog.tsx` | New |
| `components/jobs/job-row.tsx` | Add "Close job" to dropdown, render dialog |

---

## What does NOT change

- The existing email-reply close path is untouched
- The AI auto-close path in `batch.ts` is untouched
- The reopen route at `app/api/jobs/[id]/reopen/route.ts` is untouched
- `job-activity.ts` `JobActivityData` shape is unchanged (only `JobActivityEvent` changes)
- No changes to the jobs table schema — `closed_by_email_id` staying null is already the correct signal for a manual close
