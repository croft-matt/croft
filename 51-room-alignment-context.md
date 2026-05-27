# Brief 51: Room Alignment Context

## Goal

Give Tier 3 richer per-room context so `room_suggestions` is based on what a room actually contains, not just its name and description. For each room in the workspace tree, the model now sees: the description, up to three open job descriptions, and up to three recent inbound email subjects.

This benefits two cases equally:
- **Empty rooms** (My rooms with a description but no emails): the description is the only signal, and it works immediately from the moment the room is created.
- **Active rooms**: the model sees what conversations and open work already exist there and can match confidently even when the incoming email subject is vague.

No migration. No new packages. No schema changes.

---

## New type: RoomWithContext

Add to `lib/rooms/tree.ts`, below the existing `RoomRecord` interface:

```ts
// Extends RoomRecord with per-room enrichment for Tier 3 routing.
// Fields are optional so the sidebar and other non-AI callers of
// buildRoomTree can keep using plain RoomRecord[] unmodified.
export interface RoomWithContext extends RoomRecord {
  openJobDescriptions?: string[]  // up to 3, active open jobs in this room
  recentSubjects?: string[]       // up to 3, most recent inbound email subjects
}
```

---

## Changes to lib/ai/reconciliation-context.ts

### ReconciliationContext

Update the `rooms` field type:

```ts
import type { RoomWithContext } from '@/lib/rooms/tree'

// in ReconciliationContext interface:
rooms: RoomWithContext[]
```

### getReconciliationContext — enrichment queries

After the existing `allRooms` fetch (which selects `id, name, parent_room_id, description`), derive `allRoomIds` and run two enrichment queries **in parallel** via `Promise.all`. Place this block immediately after the `allRoomRecords` mapping:

```ts
const allRoomIds = (allRooms ?? []).map((r) => r.id)
```

**Query A — recent inbound email subjects per room:**

```ts
const { data: recentRoomEmails } = await supabase
  .from('room_emails')
  .select('room_id, emails!inner(id, subject, received_at, source)')
  .in('room_id', allRoomIds)
  .in('emails.source', ['inbound', 'user_cc'])
  .order('emails.received_at', { ascending: false })
  .limit(150)
```

Group by `room_id`, take first 3 non-null subjects per room:

```ts
const subjectsByRoom = new Map<string, string[]>()
for (const row of recentRoomEmails ?? []) {
  const email = row.emails as { subject: string | null } | null
  if (!email?.subject) continue
  const list = subjectsByRoom.get(row.room_id) ?? []
  if (list.length < 3) {
    list.push(email.subject)
    subjectsByRoom.set(row.room_id, list)
  }
}
```

**Query B — open jobs per room:**

Jobs have no direct `room_id` column — they link via `email_id`. Fetch the room_emails mapping for open jobs in two steps:

```ts
// Step 1: open job descriptions for this workspace
const { data: openJobRows } = await supabase
  .from('jobs')
  .select('email_id, description')
  .eq('workspace_id', workspaceId)
  .eq('status', 'open')
  .not('description', 'is', null)
  .order('created_at', { ascending: false })
  .limit(200)

// Step 2: map email_id -> room_id
const jobEmailIds = [...new Set((openJobRows ?? []).map((j) => j.email_id))]
let emailToRoom = new Map<string, string>()

if (jobEmailIds.length > 0) {
  const { data: jobRoomLinks } = await supabase
    .from('room_emails')
    .select('email_id, room_id')
    .in('email_id', jobEmailIds)
    .in('room_id', allRoomIds)

  for (const link of jobRoomLinks ?? []) {
    if (!emailToRoom.has(link.email_id)) emailToRoom.set(link.email_id, link.room_id)
  }
}

const jobsByRoom = new Map<string, string[]>()
for (const job of openJobRows ?? []) {
  const roomId = emailToRoom.get(job.email_id)
  if (!roomId || !job.description) continue
  const list = jobsByRoom.get(roomId) ?? []
  if (list.length < 3) {
    list.push(job.description)
    jobsByRoom.set(roomId, list)
  }
}
```

Wrap both A and B in `Promise.all` so they run concurrently. Wrap each in try/catch — enrichment failure must not break classification:

```ts
const [subjectsByRoom, jobsByRoom] = await Promise.all([
  fetchSubjectsByRoom(...).catch(() => new Map<string, string[]>()),
  fetchJobsByRoom(...).catch(() => new Map<string, string[]>()),
])
```

(Extract A and B into local async helpers to keep the main function readable.)

### allRoomRecords — attach enrichment

Replace the existing `allRoomRecords` mapping with:

```ts
const allRoomRecords: RoomWithContext[] = (allRooms ?? []).map((r) => ({
  id: r.id,
  name: r.name,
  parent_room_id: r.parent_room_id,
  description: r.description,
  openJobDescriptions: jobsByRoom.get(r.id) ?? [],
  recentSubjects: subjectsByRoom.get(r.id) ?? [],
}))
```

---

## Changes to lib/ai/tier3.ts

### formatRoomTree — render enrichment

Update `renderNode` to emit `jobs:` and `emails:` lines when data is present. Truncate each item to 70 characters to stay within the 5000-char room tree budget.

```ts
function renderNode(node: RoomTreeNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const desc = (node as unknown as Record<string, unknown>)['description']
  const label = desc && typeof desc === 'string' ? `${node.name} -- ${desc}` : node.name
  const lines: string[] = [`${indent}${label}`]

  const ctx = node as unknown as Record<string, unknown>

  const jobs = ctx['openJobDescriptions'] as string[] | undefined
  if (jobs && jobs.length > 0) {
    const truncated = jobs.map((j) => j.length > 70 ? j.slice(0, 67) + '...' : j)
    lines.push(`${indent}  jobs: ${truncated.join(', ')}`)
  }

  const subjects = ctx['recentSubjects'] as string[] | undefined
  if (subjects && subjects.length > 0) {
    const truncated = subjects.map((s) => s.length > 70 ? s.slice(0, 67) + '...' : s)
    lines.push(`${indent}  emails: ${truncated.map((s) => `"${s}"`).join(', ')}`)
  }

  for (const child of node.children) {
    lines.push(renderNode(child, depth + 1))
  }
  return lines.join('\n')
}
```

Example output for the model:

```
Acme Ltd -- visual rebrand of all client-facing materials for 2026 launch
  jobs: confirm logo sign-off with client, finalise print spec, book photographer
  emails: "Re: logo feedback round 3", "Print deadline moved", "Photographer..."
  Brand Refresh 2026
  jobs: review typography options
  emails: "Font shortlist for review"
Europe Press requests -- press interviews and meet and greets for European leg
```

An empty My room shows only its name and description. No `jobs:` or `emails:` lines if both lists are empty.

### Truncation limit

Bump the room tree character cap in `buildEmailContent` from 3000 to 5000:

```ts
const roomTreeText = formatRoomTree(context.rooms)
parts.push(`## Existing rooms in this workspace\n\n${roomTreeText.slice(0, 5000)}`)
```

---

## Changes to lib/ai/prompts.ts

No change to `TIER_3_SYSTEM_PROMPT`. The enrichment arrives in the user message (not the system prompt), so the cache is not invalidated. The model already knows to use room context for `room_suggestions` — the richer data feeds that same instruction.

---

## What this is NOT

- Not a new AI tier. No additional model call. The enrichment is assembled from existing DB data and passed to the existing Tier 3 call.
- Not per-email scoring. The model still produces `room_suggestions` as it does today. The enrichment gives it better evidence, not a different schema.
- Not a change to watch context. That layer (Layer 4 in reconciliation-context.ts) remains separate and fires before the room tree is shown.
- Not cached. The enrichment is in the user message and varies per email. The system prompt cache is unaffected.
