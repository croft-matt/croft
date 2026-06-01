# Brief 57: Resolution Flow Redesign — Person-Centric Response Surface

## Goal

Replace the email-anchored compose flow with a person-centric response surface. When
responding to someone who has made multiple requests across separate email threads, all
of their open items are surfaced together in one panel. The user answers each item,
unanswered items are excluded from the outgoing email entirely, and only the answered
jobs close on send. A second path closes all jobs without sending any email.

Five parts:

1. Extend `OpenLoop` with `sourceFromAddress`, restructure Jobs tab into "From others" / "Your items" / "Waiting on others"
2. Extend `useEmailSidePanel` store with respond mode
3. `PersonResponsePanel` — new component
4. Wire-up: Reply button in `EmailHeader`, Respond button in Jobs tab, panel slot split in `AppContent`
5. `sendReply` CC pass-through and body assembly utility

---

## Why

`fetchOpenJobsForThread` filters strictly by `thread_id`. Phil's three requests across two
email threads can never be surfaced together. The user must open each email, hit Reply, and
compose a separate response per thread — three emails instead of one.

The compose overlay in `EmailSidePanel` anchors the subject and recipient to the source
email. Jobs can be added but never removed once attached. There is no path to close jobs
without sending an email. The outgoing body uses "You requested:" / "You also requested:"
labels — Croft scaffolding that reaches the recipient verbatim.

The person is the correct resolution unit, not the email thread.

---

## Non-negotiables

1. No em-dashes anywhere in code, copy, or comments.
2. Unanswered items are silently excluded from the outgoing email. No placeholder, no label, nothing.
3. Only jobs whose answers were included in the send are closed. Jobs with empty answers remain open.
4. `PersonResponsePanel` renders in the same right-side panel slot as `EmailSidePanel`, replacing it entirely while respond mode is active. It is not a child overlay inside the email panel.
5. Back navigation from respond mode returns to the source email if one was open, or closes the panel fully if entered from the jobs tab.
6. `buildBodyFromJobs` in `email-side-panel.tsx` is not modified in this brief — the old function stays in place but is no longer called from the new flow. Removal is a follow-up.
7. `lib/email/send.ts` is not modified. `sendEmail` already accepts `cc` — just pass it through.
8. The `opacity-50` dim on the main content in `room-shell.tsx` must apply in both email panel mode and respond mode. `openRespond` sets `isOpen: true` so this is automatic — verify, do not add new logic.
9. No new package dependencies.
10. No migrations. No schema changes.

---

## What changes

1. Part 1 — `OpenLoop` extension and Jobs tab restructure
2. Part 2 — `useEmailSidePanel` store respond mode
3. Part 3 — `PersonResponsePanel` component and supporting server actions
4. Part 4 — Entry points and panel slot split
5. Part 5 — `sendReply` CC and body assembly utility

---

## Part 1 — OpenLoop extension and Jobs tab restructure

### Step 1.1: Add sourceFromAddress to OpenLoop

In `lib/jobs/open-loops.ts`, add the field to the interface:

```ts
export interface OpenLoop extends Job {
  age_days: number
  from_name: string | null
  source: 'extracted' | 'anticipated'
  // The from_address of the email this job was extracted from.
  // Null for anticipated jobs (no source email yet).
  sourceFromAddress: string | null
}
```

In `buildOpenLoops`, `fromAddressMap` is already the fourth parameter (defaulting to
`new Map()`). Set `sourceFromAddress` in the map step:

```ts
return {
  ...job,
  age_days,
  from_name: isSelf ? null : (fromNameMap.get(job.email_id) ?? null),
  source: (job.source === 'anticipated' ? 'anticipated' : 'extracted') as 'extracted' | 'anticipated',
  sourceFromAddress: fromAddressMap.get(job.email_id) ?? null,
}
```

No callers need updating — `fromAddressMap` already has a default and all call sites that
pass it remain valid. The new field is purely additive.

### Step 1.2: Add roomId prop to JobsTab

`JobsTab` currently receives `workspaceId` but not `roomId`. The Respond button needs
`roomId` to open the correct response surface.

In `components/room/jobs-tab.tsx`, add to `JobsTabProps`:

```ts
interface JobsTabProps {
  loops: OpenLoops
  connectedAddresses: string[]
  workspaceId: string
  roomId: string
  closedJobs?: RoomJob[]
}
```

In `components/room/room-shell.tsx`, pass it:

```tsx
case 'jobs': {
  const closedJobs = readModel.jobs.filter((j) => j.status === 'closed')
  return (
    <JobsTab
      loops={readModel.openLoops}
      connectedAddresses={readModel.connectedAddresses}
      workspaceId={readModel.workspaceId}
      roomId={room.id}
      closedJobs={closedJobs}
    />
  )
}
```

### Step 1.3: Restructure Jobs tab into three sections

Replace the current flat Open section entirely with the following three sections.

**From others** — `yourCourt` loops where `sourceFromAddress` is not null and is not a
connected address. Grouped by `sourceFromAddress`. Sorted by oldest silence first.

**Your items** — `yourCourt` loops where `sourceFromAddress` is null OR is a connected
address (self-created commitments). Flat list sorted by `updated_at` descending.

**Waiting on others** — `theirCourt` loops. Flat list sorted by `age_days` descending.
Unchanged in rendering from the current all-open list.

Build the "From others" groups client-side. Do not call `groupTheirCourtByPerson` — it
is server-only and requires DB access.

```ts
const connectedSet = new Set(connectedAddresses.map((a) => a.toLowerCase()))

// Build person groups from yourCourt where source is external.
const fromOthersMap = new Map<string, OpenLoop[]>()
const yourItems: OpenLoop[] = []

for (const loop of yourCourt) {
  const srcAddr = loop.sourceFromAddress?.toLowerCase()
  if (!srcAddr || connectedSet.has(srcAddr)) {
    yourItems.push(loop)
    continue
  }
  const existing = fromOthersMap.get(srcAddr) ?? []
  existing.push(loop)
  fromOthersMap.set(srcAddr, existing)
}

// Sort groups: most silent first (max age_days in the group).
const fromOthersGroups = [...fromOthersMap.entries()].sort(([, a], [, b]) => {
  const maxA = Math.max(...a.map((l) => l.age_days))
  const maxB = Math.max(...b.map((l) => l.age_days))
  return maxB - maxA
})
```

For each group's display name, use `from_name` from the first loop that has one, else the
raw `sourceFromAddress`.

Each person group card renders:
- Initials avatar (first two characters of display name, uppercase, same hash-neutral colour
  pattern as `PeopleTab`)
- Display name (bold) + address (muted, truncated)
- Item count badge + "1 overdue" in danger colour if any loop in the group is overdue
- "Respond" pill button — see Step 1.4 for the onClick
- Below the header: one row per loop showing status dot, description, source label
  (`from_name` or address truncated to 30 chars + `· Xd ago`)

Status dot colours: red if `isOverdue`, amber if `due` is set and not overdue, muted otherwise.
Use the same `formatDue` logic as `JobRow`.

Item rows are not interactive in this view. The entire person is resolved at once via
the Respond button.

### Step 1.4: Respond button onClick

```tsx
'use client'

import { useEmailSidePanel } from '@/stores/email-side-panel-store'

// Inside the component:
const { openRespond } = useEmailSidePanel()

// Per-group Respond button:
<button
  type="button"
  onClick={() =>
    openRespond({
      personAddress: srcAddr,
      personName: displayName !== srcAddr ? displayName : null,
      roomId: roomId,
    })
  }
>
  Respond
</button>
```

No `returnToEmailId` here — the user came from the jobs tab, not from an open email.

---

## Part 2 — Store: respond mode

In `stores/email-side-panel-store.ts`, add respond mode to the state interface and
implement the two new actions.

Add to `EmailSidePanelState`:

```ts
// Respond mode — PersonResponsePanel renders instead of EmailSidePanel.
respondMode: boolean
respondPersonAddress: string | null
respondPersonName: string | null
respondRoomId: string | null
// Set when respond mode was triggered from an open email, so Back can return to it.
respondReturnToEmailId: string | null

openRespond: (params: {
  personAddress: string
  personName: string | null
  roomId: string
  returnToEmailId?: string
}) => void
closeRespond: () => void
```

Add initial values in the `create` call:

```ts
respondMode: false,
respondPersonAddress: null,
respondPersonName: null,
respondRoomId: null,
respondReturnToEmailId: null,
```

Add the actions:

```ts
openRespond: ({ personAddress, personName, roomId, returnToEmailId }) => {
  const scrollY = document.querySelector('main')?.scrollTop ?? 0
  set({
    isOpen: true,
    respondMode: true,
    respondPersonAddress: personAddress,
    respondPersonName: personName,
    respondRoomId: roomId,
    respondReturnToEmailId: returnToEmailId ?? null,
    roomScrollY: scrollY,
    pendingResolveJobIds: [],
  })
},

closeRespond: () => {
  const { respondReturnToEmailId, roomScrollY } = get()
  if (respondReturnToEmailId) {
    // Return to the email that triggered respond mode.
    set({
      respondMode: false,
      respondPersonAddress: null,
      respondPersonName: null,
      respondRoomId: null,
      respondReturnToEmailId: null,
      emailId: respondReturnToEmailId,
    })
  } else {
    // No source email — close the panel fully and restore scroll.
    set({
      isOpen: false,
      respondMode: false,
      respondPersonAddress: null,
      respondPersonName: null,
      respondRoomId: null,
      respondReturnToEmailId: null,
      emailId: null,
      initialTab: 'jobs',
      history: [],
      pendingResolveJobIds: [],
      roomScrollY: 0,
    })
    const main = document.querySelector('main')
    if (main) main.scrollTop = roomScrollY
  }
},
```

The `partialize` function is unchanged — it only persists `isOpen` and `emailId`. All
respond mode fields are transient and correctly excluded.

---

## Part 3 — PersonResponsePanel

### Step 3.1: fetchPersonResponseJobs server action

In `app/(app)/rooms/[id]/actions/send-reply.ts`, add:

```ts
export type PersonResponseJob = Job & {
  sourceSubject: string | null
  sourceReceivedAt: string
}

export async function fetchPersonResponseJobs(
  roomId: string,
  personAddress: string,
): Promise<PersonResponseJob[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  // Email IDs in this room.
  const { data: roomEmailRows } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)

  const roomEmailIds = (roomEmailRows ?? []).map((r) => r.email_id)
  if (roomEmailIds.length === 0) return []

  // Emails in this room sent by this person (case-insensitive).
  const { data: fromEmails } = await supabase
    .from('emails')
    .select('id, subject, received_at')
    .in('id', roomEmailIds)
    .ilike('from_address', personAddress)
    .order('received_at', { ascending: false })

  const fromEmailIds = (fromEmails ?? []).map((e) => e.id)
  if (fromEmailIds.length === 0) return []

  // Connected addresses — scope to your-court jobs only.
  const { data: accountRows } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const connectedAddresses = (accountRows ?? []).map((r) => r.email_address.toLowerCase())

  // Open jobs from those emails, owned by a connected address.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('*')
    .in('email_id', fromEmailIds)
    .eq('status', 'open')
    .in('owner', connectedAddresses)
    .order('created_at', { ascending: true })

  const emailMetaMap = new Map(
    (fromEmails ?? []).map((e) => [e.id, { subject: e.subject, receivedAt: e.received_at }]),
  )

  return ((jobRows ?? []) as Job[]).map((job) => {
    const meta = emailMetaMap.get(job.email_id)
    return {
      ...job,
      sourceSubject: meta?.subject ?? null,
      sourceReceivedAt: meta?.receivedAt ?? job.created_at,
    }
  })
}
```

### Step 3.2: markJobsDone server action

In `app/(app)/rooms/[id]/actions/send-reply.ts`, add:

```ts
export async function markJobsDone(
  jobIds: string[],
): Promise<{ success: boolean; error?: string }> {
  if (jobIds.length === 0) return { success: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated.' }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No workspace.' }

  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'closed',
      closed_by_email_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', jobIds)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')

  if (error) return { success: false, error: error.message }
  return { success: true }
}
```

### Step 3.3: Body assembly utility

New file: `lib/email/compose.ts`

```ts
export interface PersonReplyItem {
  description: string
  answer: string // must be non-empty — filter before calling
}

// Builds the plain-text body for a person reply from answered items only.
// Single item: greeting + answer + sign-off, no "Re:" label.
// Multiple items: each answer preceded by "Re: [description]".
export function buildPersonReplyBody(
  items: PersonReplyItem[],
  recipientFirstName: string,
  senderFirstName: string,
): string {
  if (items.length === 0) return ''

  const greeting = `Hi ${recipientFirstName},`
  const signOff = `Best,\n${senderFirstName}`

  if (items.length === 1) {
    return [greeting, items[0].answer.trim(), signOff].join('\n\n')
  }

  const blocks = items.map((item) => `Re: ${item.description}\n${item.answer.trim()}`)
  return [greeting, ...blocks, signOff].join('\n\n')
}

// Derives a first name from a display name or email address.
// Used for reply greetings and sign-offs.
export function firstNameFrom(nameOrAddress: string): string {
  if (!nameOrAddress) return ''
  if (nameOrAddress.includes('@')) {
    return nameOrAddress.split('@')[0]
  }
  return nameOrAddress.split(/\s+/)[0]
}
```

### Step 3.4: PersonResponsePanel component

New file: `components/room/person-response-panel.tsx`

The component is `'use client'`. It reads all context from `useEmailSidePanel` directly —
no props.

**Internal state:**

```ts
type PanelView = 'filling' | 'reviewing' | 'sending' | 'sent'

interface ItemState {
  jobId: string
  description: string
  intent: string
  emailId: string
  sourceSubject: string | null
  sourceReceivedAt: string
  answer: string
}
```

On mount, call `fetchPersonResponseJobs(respondRoomId, respondPersonAddress)`. Initialise
one `ItemState` per returned job with `answer: ''`.

Also fetch connected addresses via `getWorkspaceId` + `supabase.from('email_accounts')` to
derive `senderFirstName` for the sign-off.

**Computed values:**

```ts
const answeredItems = items.filter((i) => i.answer.trim().length > 0)
const skippedCount = items.length - answeredItems.length
const canReview = answeredItems.length > 0
```

**Most recent email for threading:** the job with the highest `sourceReceivedAt` provides
the `emailId` passed to `sendReply` as the threading anchor.

```ts
const mostRecentEmailId = items.reduce<string | null>((best, item) => {
  if (!best) return item.emailId
  const bestJob = items.find((i) => i.emailId === best)
  if (!bestJob) return item.emailId
  return item.sourceReceivedAt > bestJob.sourceReceivedAt ? item.emailId : best
}, null)
```

**Subject:** default to `Re: ` + the subject of the most recent source email. Fetch subject
from the `PersonResponseJob` data. Fall back to `'Re: (no subject)'`.

**To field state:** `string[]` starting with `[respondPersonAddress]`. Supports adding
additional addresses via a small text input (same pill pattern as `ToField` if possible, or
a simple comma-separated input as fallback).

**CC field state:** `string[]` starting empty. A "+ Add CC" link shows a text input row.

**Attachment state:** `string[]` of selected asset IDs. Opens the existing `AssetPickerModal`.

---

**Filling view** renders:

1. Panel header: Back button (`closeRespond`), "Respond" centred title, Close button (`closeRespond`)
2. Person header: initials avatar + name or address + org if available + item count
3. Items list (loading skeleton while fetching): one card per job

   Each job card:
   - Intent badge — reuse `intentBadgeClass` map from `email-side-panel.tsx`
   - Job description
   - Source citation in muted text: subject truncated to 40 chars + ` · ` + relative age from
     `sourceReceivedAt` using `formatRelativeTime` from `@/lib/utils`
   - Controlled textarea. Placeholder per intent:
     - `REQUEST` / `CHASE` — `"e.g. Yes, confirmed..."`
     - `QUERY` — `"e.g. The answer is..."`
     - `DELIVER` — `"e.g. Sending this now..."`
     - Default — `"Your answer..."`
   - `rows={2}`, resizes as needed

4. Send details section:
   - **To** row: person pill (avatar + name), "+ Add" link that appends a text input for
     additional addresses
   - **CC** row: empty by default, "+ Add CC" link reveals a text input
   - **Subject** row: editable field seeded from `defaultSubject`, pencil icon on right
   - **Attach** row: selected asset pills with remove buttons, "+ Attach" link opens
     `AssetPickerModal`

5. Footer:
   - "Mark all done" ghost button — calls `markJobsDone` with all job IDs, then `closeRespond`
   - "Review & send" primary button — disabled unless `canReview`, transitions to `'reviewing'`

---

**Reviewing view** renders:

1. Panel header: Back button (transitions back to `'filling'`), "Review" centred title,
   Close button (`closeRespond`)
2. Recipients summary:
   - To row: person pill + any additional to pills
   - CC row: only if CC recipients exist
   - Subject row
3. Email body preview: the output of `buildPersonReplyBody` rendered as preformatted-ish
   prose. Answered items only. Each item shows as:
   - Small label line: `"Re: [description]"` in muted `text-[11px]` (hidden for single-item
     replies)
   - Answer text in a light bordered block
   - Greeting and sign-off shown above/below the blocks
4. Attachment chip if any assets selected
5. Footer status line:
   - Left: checkmark icon + `"Closes N job[s] on send"` in muted text
   - Right (if any skipped): `"X item[s] not included — job[s] stay open"` in warning colour
6. Footer actions: "Back" ghost button (returns to `'filling'`), "Send and close N jobs"
   primary button

---

**Sending / sent states:**

Transition to `'sending'` on send click. Show a spinner in the primary button.

On success, transition to `'sent'`. After 1200ms, call `closeRespond`.

On error, return to `'reviewing'` and show the error message above the footer.

---

**Send logic:**

```ts
async function handleSend() {
  if (!mostRecentEmailId || !respondRoomId) return
  setSending(true)

  const body = buildPersonReplyBody(
    answeredItems.map((i) => ({ description: i.description, answer: i.answer })),
    firstNameFrom(respondPersonName ?? respondPersonAddress ?? ''),
    senderFirstName,
  )

  const result = await sendReply({
    roomId: respondRoomId,
    emailId: mostRecentEmailId,
    to: toAddresses,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    body,
    selectedAssetIds,
    closingJobIds: answeredItems.map((i) => i.jobId),
  })

  if (!result.success) {
    setError(result.error ?? 'Failed to send.')
    setView('reviewing')
    return
  }

  setView('sent')
  setTimeout(() => closeRespond(), 1200)
}
```

---

## Part 4 — Entry points and panel slot split

### Step 4.1: EmailHeader — onReply becomes onRespond

In `components/email/email-header.tsx`, rename `onReply` to `onRespond` and update the
button label:

```tsx
interface EmailHeaderProps {
  email: Email
  jobs: Job[]
  rooms: Pick<Room, 'id' | 'name'>[]
  onRespond?: () => void
  repliedTo?: boolean
}

// Button label:
{repliedTo ? 'Respond again' : 'Respond'}
```

### Step 4.2: EmailSidePanel — Reply triggers respond mode

In `components/room/email-side-panel.tsx`:

Add `openRespond` from the store. Replace `handleReply` with `handleRespond`:

```ts
const { openRespond } = useEmailSidePanel()

function handleRespond() {
  if (!data) return
  openRespond({
    personAddress: data.email.from_address,
    personName: data.email.from_name ?? null,
    roomId: data.rooms[0]?.id ?? '',
    returnToEmailId: data.email.id,
  })
}
```

Update the `EmailHeader` prop:

```tsx
<EmailHeader
  email={data.email}
  jobs={data.jobs}
  rooms={data.rooms}
  onRespond={handleRespond}
  repliedTo={panelState.mode === 'sent'}
/>
```

Do not remove the `panelState` machine or `ComposeArea` yet — they are no longer triggered
by `EmailHeader` but removing them is a separate clean-up. Leave them in place.

### Step 4.3: AppContent — panel slot split

In `components/layout/app-content.tsx`, import `PersonResponsePanel` and read
`respondMode` from the store. Replace the single `EmailSidePanel` render with a
conditional:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { EmailSidePanel } from '@/components/room/email-side-panel'
import { PersonResponsePanel } from '@/components/room/person-response-panel'

export function AppContent({ children }: AppContentProps) {
  const { isOpen, respondMode } = useEmailSidePanel()
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShowPanel(true)
    } else {
      const timer = setTimeout(() => setShowPanel(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  return (
    <div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
      <main
        className={cn(
          'min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:flex-1 w-0' : 'flex-1',
        )}
      >
        {children}
      </main>

      <div
        className={cn(
          'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-1/2 w-full' : 'w-0',
        )}
      >
        {showPanel && (
          <div
            className={cn(
              'h-full bg-background border border-border rounded-3xl overflow-hidden transition-transform duration-200 ease-out',
              isOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            {respondMode ? <PersonResponsePanel /> : <EmailSidePanel />}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Part 5 — sendReply CC pass-through

### Step 5.1: Add cc to sendReply params

In `app/(app)/rooms/[id]/actions/send-reply.ts`, add `cc` to the params type:

```ts
export async function sendReply(params: {
  roomId: string
  emailId: string
  to: string[]
  cc?: string[]
  body: string
  selectedAssetIds: string[]
  closingJobIds?: string[]
}): Promise<{ success: boolean; error?: string }>
```

Pass it to `sendEmail`:

```ts
const result = await sendEmail({
  workspaceId: room.workspace_id,
  to: params.to,
  cc: params.cc?.length ? params.cc : undefined,
  subject,
  bodyText: params.body,
  inReplyTo: sourceEmail.message_id ?? undefined,
  references: sourceEmail.message_id ? [sourceEmail.message_id] : undefined,
  attachments: attachments.length > 0 ? attachments : undefined,
  roomId: params.roomId,
  threadId: sourceEmail.thread_id ?? undefined,
  source: 'user_reply',
  attachedAssetIds:
    params.selectedAssetIds.length > 0 ? params.selectedAssetIds : undefined,
})
```

`sendEmail` already has `cc` in its Zod schema and passes it to Resend. No further
changes to `lib/email/send.ts`.

---

## File locations

```
lib/jobs/open-loops.ts                               sourceFromAddress added to OpenLoop and buildOpenLoops (modified)
lib/email/compose.ts                                 buildPersonReplyBody, firstNameFrom (new)
stores/email-side-panel-store.ts                     respondMode, openRespond, closeRespond (modified)
components/room/jobs-tab.tsx                         roomId prop, person-grouped "From others" (modified)
components/room/room-shell.tsx                       roomId passed to JobsTab (modified)
components/room/person-response-panel.tsx            PersonResponsePanel (new)
components/email/email-header.tsx                    onReply renamed to onRespond (modified)
components/room/email-side-panel.tsx                 handleReply replaced with handleRespond via store (modified)
components/layout/app-content.tsx                    panel slot split on respondMode (modified)
app/(app)/rooms/[id]/actions/send-reply.ts           fetchPersonResponseJobs, markJobsDone, cc in sendReply (modified)
```

No migrations. No schema changes. No new packages.

---

## Acceptance criteria

- [ ] `OpenLoop` has a `sourceFromAddress` field set from `fromAddressMap` in `buildOpenLoops`
- [ ] `JobsTab` renders three sections: "From others", "Your items", "Waiting on others"
- [ ] "From others" contains only `yourCourt` loops where `sourceFromAddress` is external
- [ ] "Your items" contains `yourCourt` loops where `sourceFromAddress` is null or a connected address
- [ ] "Waiting on others" contains `theirCourt` loops unchanged in behaviour
- [ ] Person groups in "From others" are sorted by most silent first
- [ ] Each person group card shows name/address, item count, overdue flag if applicable, and a Respond button
- [ ] Clicking Respond from the jobs tab calls `openRespond` with no `returnToEmailId`
- [ ] `openRespond` sets `isOpen: true` and `respondMode: true` in the store
- [ ] `AppContent` renders `PersonResponsePanel` when `respondMode` is true
- [ ] `AppContent` renders `EmailSidePanel` when `respondMode` is false
- [ ] The main content dims to `opacity-50` when respond mode is active (no new logic needed — `isOpen: true` already drives this)
- [ ] Clicking Reply/Respond in the email side panel calls `openRespond` with `returnToEmailId` set to the current email ID
- [ ] Back button in `PersonResponsePanel` when `respondReturnToEmailId` is set returns to that email view
- [ ] Back button when `respondReturnToEmailId` is null closes the panel fully
- [ ] `PersonResponsePanel` reads all context (personAddress, personName, roomId) from the store — no props
- [ ] `fetchPersonResponseJobs` returns open jobs owned by connected addresses from emails sent by `personAddress` in the specified room
- [ ] `fetchPersonResponseJobs` scopes to room via `room_emails`, not workspace-wide
- [ ] Each job card renders intent badge, description, source citation, and a controlled textarea
- [ ] Source citation shows truncated subject and relative age
- [ ] "Review & send" is disabled until at least one item has a non-empty answer
- [ ] Reviewing view shows only answered items in the body preview
- [ ] Unanswered items are completely absent from the body preview
- [ ] "X items not included — jobs stay open" appears in reviewing view when any items were skipped
- [ ] `buildPersonReplyBody` with one item produces no "Re:" label
- [ ] `buildPersonReplyBody` with multiple items produces "Re: [description]" before each answer block
- [ ] No "You requested:" or "You also requested:" text appears anywhere in an outgoing email
- [ ] Send closes only jobs in `answeredItems` — jobs with empty answers remain open after send
- [ ] CC addresses entered in the send details are passed through `sendReply` to `sendEmail`
- [ ] `markJobsDone` closes all loaded jobs and calls `closeRespond` — no email is sent
- [ ] `lib/email/send.ts` is not modified
- [ ] No em-dashes in any modified or new file
