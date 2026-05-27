# Brief 49: My Rooms

## Goal

Allow the user to intentionally create rooms before any emails arrive. A manually created room has a name and a short description. The description gives Tier 3 a routing target so incoming emails land in the right place without the user doing anything after the initial setup.

## The two problems this solves

**Intentional spaces.** Right now every room in the sidebar was created by the AI from an email. There is no way to say "I know this project is starting, I want a room ready for it." The sidebar shows you what Croft found, not what you care about.

**Better routing.** Tier 3 currently gets a tree of room names for `room_suggestions`. Names alone are ambiguous ("Europe" could mean several things). A description gives the model explicit context so it can route confidently even when the email subject is vague.

---

## Schema

No migration needed. `rooms.description` (text | null) and `rooms.created_by` (text | null) are already on the table.

- `created_by` is set to the authenticated user's ID when a room is manually created.
- `created_by` is null on all AI-created rooms.
- `description` is the user-entered routing hint. Free text, no length constraint in the DB but the UI caps input at 120 characters.

---

## Sidebar changes

The sidebar currently has:
1. Four top nav items (Home, All jobs, Contacts, Assets)
2. NotificationBell
3. Rooms section (AI-created)

Add a **My rooms** section between the NotificationBell and the existing Rooms section.

### My rooms section

- Section header: "My rooms" with a `+` icon button on the right (Lucide `Plus`, same size as the chevrons on the Rooms header).
- Lists only rooms where `created_by` is not null, ordered by `created_at` desc.
- Each row shows the room name. If `description` is set, show it as a single truncated line below the name in a smaller muted style (`text-[10px]` or `text-xs text-muted-foreground`, truncated with `truncate`).
- Clicking a room navigates to `/rooms/[id]` as normal.
- The section is always visible (no collapse toggle for now). If the user has no manual rooms yet, the section header still shows with the `+` button and no rows beneath it.
- No overdue indicators or progress bars on My rooms rows — those only make sense once emails have arrived, and the room may be empty.

### Existing Rooms section

No changes. AI-created rooms continue to appear here. When a manually created room starts receiving emails (because Tier 3 matched it by name/description), it stays in My rooms — it does not migrate to the Rooms section. The two sections are defined by origin, not by whether the room has content.

---

## Create room flow

Clicking `+` in the My rooms header opens an inline form directly in the sidebar — no modal, no navigation. The form appears immediately below the header, above any existing My rooms rows.

### Form fields

**Name** (required)
- Single-line text input, placeholder "Room name"
- Auto-focused on open

**Description** (optional)
- Single-line text input, placeholder "What's this room for? (helps Croft route emails)"
- Max 120 characters, character count shown when the field has content
- This copy makes the routing purpose explicit without over-explaining

### Actions

- **Enter** on either field (or a small "Create" button): submits
- **Escape**: cancels and closes the form
- On submit: call the `createRoom` server action, close the form, the new room appears at the top of My rooms immediately (optimistic or post-revalidation)

### Validation

- Name is required and must be non-empty after trim.
- No duplicate check at the UI layer — if a room with the same name exists, Tier 3 will route to it via fuzzy match anyway. Creating a second room with a near-identical name is not harmful.

---

## Server action: createRoom

Location: `app/(app)/rooms/actions.ts` (alongside existing room mutation actions).

```ts
'use server'

export async function createRoom(
  workspaceId: string,
  name: string,
  description: string | null
): Promise<{ roomId: string }>
```

- Calls `requireUser()` and verifies workspace membership.
- Inserts into `rooms` with `name`, `description`, `workspace_id`, `created_by` set to the authenticated user's ID, `room_data: {}`, `status: 'active'`.
- Returns `{ roomId }`.
- Calls `revalidatePath('/')` so the sidebar refreshes.

---

## Tier 3 routing improvement

This is the part that makes the feature useful for routing, not just organisation.

### Changes to `lib/rooms/tree.ts`

Extend `RoomRecord` to carry an optional description:

```ts
export interface RoomRecord {
  id: string
  name: string
  parent_room_id: string | null
  description?: string | null
}
```

`buildRoomTree` passes extra fields through already, so no logic change needed there.

### Changes to `lib/ai/tier3.ts`

`formatRoomTree` renders the tree as an indented string. For rooms that have a description, append it inline:

```
Acme Ltd
  Brand Refresh 2026 — visual rebrand of all client-facing materials for 2026 launch
  Annual Accounts
Europe Press requests — press interviews and meet and greets for the European tour
```

Only rooms with a description get the suffix. The separator is ` — ` (space-hyphen-hyphen-space, not an em-dash). This keeps the format machine-readable while giving the model clear context.

### Changes to `lib/ai/reconciliation-context.ts`

The room fetch that builds the context currently selects `id, name, parent_room_id`. Add `description`:

```ts
.select('id, name, parent_room_id, description')
```

No other changes needed — `RoomRecord` is now typed to accept it and `formatRoomTree` will render it.

---

## Sidebar data fetch

The sidebar already receives `rooms: RoomWithOverdue[]` from the layout. Extend the query in `lib/queries/cockpit.ts` (or wherever the sidebar rooms query lives) to also fetch rooms where `created_by is not null`, including their `description`. Pass both sets to `Sidebar` as separate props:

```ts
interface SidebarProps {
  rooms: RoomWithOverdue[]         // AI-created (created_by is null)
  myRooms: MyRoom[]                // Manually created (created_by is not null)
  workspaceId: string
  unreadCount: number
}

interface MyRoom {
  id: string
  name: string
  description: string | null
  created_at: string
}
```

Or fetch both in a single query and split by `created_by` in the component — either is fine.

---

## What this is NOT

- Not a folder system. My rooms are not a hierarchy. If you want a child room, that comes from email routing after the room exists.
- Not a template. The description is a routing hint, not a project brief. Keep the input placeholder copy focused on routing.
- Not a migration of existing rooms. Rooms that already exist with `created_by null` stay in the Rooms section even if a user would have created them intentionally.
- Manual room creation via UI is the only new creation path. The email-to-Croft proactive room path (Brief 38) continues to exist and also sets `created_by` — those rooms should appear in My rooms too.
