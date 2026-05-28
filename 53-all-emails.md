# Brief 53: All Emails

## What this is

A new cross-room view that lists all project emails in reverse chronological order. It sits in the sidebar underneath All Jobs and is the canonical place to see everything that has landed across your rooms.

The primary output of this brief is the `EmailRow` component — the reusable email display unit that will be pulled into notifications, room views, and anywhere else an email needs to be shown. Getting this component right here, in a focused list context, means we don't have to redesign it later.

Emails in this view are already filtered. They passed the noise gate, they belong to a room, they are worth looking at. There is no inbox anxiety. This is a project feed, not a mailbox.

Clicking an email row does nothing in this brief. That behaviour comes in the next brief.

---

## Data model

No migration needed. All columns already exist.

**One row per thread.** Where multiple emails share a `thread_id`, show only the most recent. Emails with no `thread_id` appear as individual rows.

**Query intent:**

```ts
// lib/queries/all-emails.ts

DISTINCT ON (COALESCE(thread_id, id::text))
FROM emails
WHERE processing_state != 'ignored'
  AND workspace_id = workspaceId
LEFT JOIN room_emails -> rooms (for room name and room id)
LEFT JOIN COUNT(jobs) WHERE jobs.email_id = emails.id (for job count)
ORDER BY COALESCE(thread_id, id::text), received_at DESC
// then re-sort result set by received_at DESC before returning
LIMIT 100
```

Use the same room resolution pattern as `lib/queries/all-jobs.ts` — join through `room_emails` rather than directly on `emails.room_id`, since that column may not always be populated at query time.

**Return type:**

```ts
export interface AllEmailsRow {
  id: string
  threadId: string | null
  fromName: string | null
  fromAddress: string
  subject: string
  subjectSummary: string | null
  receivedAt: string           // ISO
  processingState: string
  urgencyScore: number | null
  roomId: string | null
  roomName: string | null
  jobCount: number
  source: string               // inbound | user_sent | user_cc | user_direct
}
```

---

## EmailRow component

**File:** `components/email/email-row.tsx`  
**Export:** named `EmailRow`

This component is static. No `onClick`. No `cursor-pointer`. No hover state. It is a display card only.

### Layout

Two-line card. Consistent with `JobRow` in density and border style.

```
┌─────────────────────────────────────────────────────────┐
│  Sender name                              2h ago         │
│  Subject or AI summary (truncated)   [Room name]         │
│  [Urgency] [3 jobs]                                      │
└─────────────────────────────────────────────────────────┘
```

**Line 1:**
- Left: `from_name` if present, else `from_address`. `text-sm font-medium text-foreground`
- Right: relative time from `received_at` (e.g. "2h ago", "yesterday", "3 May"). `text-xs text-muted-foreground`

**Line 2:**
- Left: `subject_summary` if `processing_state === 'processed'` and summary exists, else `subject`. Truncated to one line. `text-sm text-muted-foreground truncate`
- Right: room pill — room name in a small rounded badge, same style as existing room pills in the codebase. Link to `/rooms/${roomId}` (the pill itself is a link even though the row is not). If no room, omit.

**Line 3 (badges, omit entirely if none apply):**
- Urgency badge: show only if `urgency_score >= 7`. Label "Urgent". Red variant.
- Job count badge: show only if `job_count > 0`. Label "1 job" / "3 jobs". Muted variant.
- Source badge: show only if `source === 'user_sent'`. Label "Sent". Subtle, not coloured.

### Props

```ts
interface EmailRowProps {
  email: AllEmailsRow
}
```

### Relative time helper

Write a small local `formatRelative(iso: string): string` function inside the component file. Do not import a date library.

```ts
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
```

---

## Page

**File:** `app/(app)/all-emails/page.tsx`  
**Type:** server component

```tsx
export default async function AllEmailsPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const emails = await getAllEmails(workspaceId)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">All emails</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {emails.length === 0
          ? 'No emails yet.'
          : `${emails.length} ${emails.length === 1 ? 'email' : 'emails'} across all rooms`}
      </p>

      {emails.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      )}

      <div className="space-y-2">
        {emails.map((email) => (
          <EmailRow key={email.id} email={email} />
        ))}
      </div>
    </div>
  )
}
```

---

## Sidebar

**File:** `components/nav/sidebar.tsx`

Add `Mail` to the lucide-react import. Add All Emails to `topNavItems` immediately after All Jobs:

```ts
import { Settings, Home, Users, Paperclip, CheckSquare, Mail, Plus } from 'lucide-react'

const topNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/all-jobs', label: 'All jobs', icon: CheckSquare },
  { href: '/all-emails', label: 'All emails', icon: Mail },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/assets', label: 'Assets', icon: Paperclip },
]
```

---

## Files changed

| File | Status |
|---|---|
| `lib/queries/all-emails.ts` | New |
| `components/email/email-row.tsx` | New |
| `app/(app)/all-emails/page.tsx` | New |
| `components/nav/sidebar.tsx` | Add Mail icon + nav item |

No migration. No new schema. No background jobs.

---

## What this is not

- Not an email client. No compose, no reply, no mark-as-read.
- Not clickable. The row destination is designed in the next brief.
- Not a full thread view. One row per thread, most recent email only.
- Not paginated yet. 100-email limit is fine for an initial build.
