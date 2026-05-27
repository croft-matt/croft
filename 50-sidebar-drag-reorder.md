# Brief 50: Sidebar Drag — Reorder and Reparent

## Goal

Let users reorder and reparent rooms in the sidebar by dragging. To the user this is organisation. To Tier 3, the room tree is the routing map — every reparent updates `parent_room_id`, which `formatRoomTree` passes directly to the classification prompt. A user tidying their sidebar is correcting the AI's understanding of how their projects relate. This is not cosmetic.

Two drag outcomes are possible:

- **Reorder**: drop between two siblings at the same depth. Updates `sidebar_order`.
- **Reparent**: drop onto a room name (hover for 600ms). Updates `parent_room_id`. Capped at 2 levels deep (root and one level of children). A child room cannot be reparented into another child room.

Both sections support both behaviours: My rooms and AI rooms.

---

## New packages

Add to `package.json` via `pnpm add`:

```
@dnd-kit/core
@dnd-kit/sortable
@dnd-kit/utilities
```

---

## Schema

**Migration**: `supabase/migrations/20260527000004_rooms_sidebar_order.sql`

```sql
alter table rooms add column sidebar_order integer null;
```

No default. Existing rooms get null and fall back to the current sort order until a user drags something. `parent_room_id` already exists on the rooms table — no change needed.

---

## Server actions

Add both to `lib/rooms/actions.ts`.

### reorderRooms

```ts
// Persists a new sidebar order for a sibling group.
// orderedIds: all room IDs in the group, in the new display order.
// parentRoomId: null for root rooms in AI section, the parent's ID for children.
//   Pass 'my-rooms' as a sentinel for the My rooms section (created_by not null).
export async function reorderRooms(
  workspaceId: string,
  orderedIds: string[],
  parentRoomId: string | null | 'my-rooms',
): Promise<RoomActionResult>
```

Implementation:
- Call `requireUser()`.
- For each index `i`, update `rooms.sidebar_order = i` where `id = orderedIds[i]` and `workspace_id = workspaceId`.
- Batch as individual updates (single-digit rows, no upsert needed).
- Call `revalidatePath('/', 'layout')`.
- Return `{ success: true }`.

### reparentRoom

```ts
// Moves a room under a new parent (or to root).
// newParentId: the target room's ID, or null to move to root.
// Depth guard: if newParentId itself has a parent_room_id, reject — max depth is 2 levels.
export async function reparentRoom(
  workspaceId: string,
  roomId: string,
  newParentId: string | null,
): Promise<RoomActionResult>
```

Implementation:
- Call `requireUser()`.
- If `newParentId` is not null: fetch the target room and check its `parent_room_id`. If it is not null, return `{ success: false, error: 'max_depth' }` — do not update.
- Update `rooms set parent_room_id = newParentId, sidebar_order = null` where `id = roomId` and `workspace_id = workspaceId`. Null out `sidebar_order` so the room lands at the natural end of its new sibling group.
- Call `revalidatePath('/', 'layout')`.
- Return `{ success: true }`.

---

## Query changes

### `lib/queries/cockpit.ts`

**`getMyRooms`**: Add `sidebar_order` to select. Change order to:
```ts
.order('sidebar_order', { ascending: true, nullsFirst: false })
.order('created_at', { ascending: false })
```

**`getRoomsTree`**: Already selects `*` so `sidebar_order` comes through automatically. Change order to:
```ts
.order('sidebar_order', { ascending: true, nullsFirst: false })
.order('created_at', { ascending: true })
```

The tree builder (`buildTree` in `rooms-tree.tsx`) groups by `parent_room_id`, so sibling order from the query is preserved per group.

**`MyRoom` interface**: Add `sidebar_order: number | null`.

`RoomWithOverdue` extends `Room` from generated types. After Matt runs the migration and regenerates types, `sidebar_order` is present automatically. No manual change to the interface needed.

---

## Drag modes and visual states

During a drag there are two possible modes. The mode is determined by what the dragged item is hovering over:

| Hovering over | Mode | Visual |
|---|---|---|
| Gap between rooms | Reorder | Horizontal insertion line (`border-t-2 border-primary`) above the target room |
| A room name (600ms dwell) | Reparent | Target room gets `bg-accent ring-1 ring-primary/30 rounded` highlight. DragOverlay shifts right by 12px to signal nesting intent. |

Switching between modes is immediate when the hover target changes. The 600ms dwell prevents accidental reparents during fast moves.

Mode is stored in a `dragMode: 'reorder' | 'nest' | null` ref at the `DndContext` level. On `DragMove`, update `dragMode` based on whether the pointer has dwelt on a room name long enough. Use a `setTimeout` ref per hover target — clear it when the pointer moves off.

On `DragEnd`, read `dragMode`:
- `'reorder'`: call `reorderRooms`.
- `'nest'`: call `reparentRoom`. If the action returns `{ error: 'max_depth' }`, revert state silently (no toast — the depth cap is communicated visually before drop, see below).

**Depth cap visual**: When dragging a room that already has children (i.e. it is a parent), disable nest mode entirely for that drag — hovering over a room name shows no highlight and `dragMode` never becomes `'nest'`. A cursor of `cursor-not-allowed` appears on hover over room names during this drag.

When dragging a root room toward a child room (which would exceed 2 levels), hovering over that child shows the target row with `opacity-40` and no highlight. `dragMode` stays `'reorder'`.

---

## My rooms: SortableMyRooms component

Extract the My rooms list out of `sidebar.tsx` into `components/nav/sortable-my-rooms.tsx`.

```ts
'use client'

import { useState, useTransition, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, DragEndEvent, DragMoveEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { reorderRooms, reparentRoom } from '@/lib/rooms/actions'
import type { MyRoom } from '@/lib/queries/cockpit'
```

Props: `{ initialRooms: MyRoom[], workspaceId: string }`.

State:
- `rooms`: local copy of `initialRooms` for optimistic updates.
- `activeId: string | null`: ID of the room being dragged, for DragOverlay.
- `dragMode: 'reorder' | 'nest' | null` ref.
- `nestTargetId: string | null` ref: ID of the room currently being hovered for nesting.
- `nestTimer: ReturnType<typeof setTimeout> | null` ref: cleared on hover change.

On `DragEnd`:
1. Clear `nestTimer`. Read `dragMode`.
2. If `'reorder'`: `arrayMove`, set state, fire `reorderRooms(..., 'my-rooms')` in transition. On failure, revert.
3. If `'nest'`: move room under `nestTargetId` in local state, fire `reparentRoom`. On `max_depth` error or failure, revert.
4. Reset `activeId`, `dragMode`, `nestTargetId`.

Each sortable row (`SortableMyRoomRow`):
- Uses `useSortable({ id: room.id })`.
- Apply `transform: CSS.Transform.toString(transform)` and `transition` to the row element.
- `isDragging`: `opacity-40`.
- `isNestTarget` (passed as prop from parent, true when `nestTargetId === room.id`): apply `bg-accent ring-1 ring-primary/30 rounded`.
- `isReorderTarget` (passed as prop, true when row is the reorder insertion target): apply `border-t-2 border-primary`.
- Show `GripVertical` (h-3 w-3, `cursor-grab`, muted foreground) on hover. Use `group` on the row and `group-hover:opacity-100 opacity-0 transition-opacity` on the icon.
- Keep existing Link and description rendering from `sidebar.tsx`.

DragOverlay renders the active room row at full opacity with `shadow-md ring-1 ring-primary/20`. When `dragMode === 'nest'`, apply `translate-x-3` to the overlay to signal indent.

In `sidebar.tsx`:
- Remove the inline My rooms list.
- Render `<SortableMyRooms initialRooms={myRooms} workspaceId={workspaceId} />`.
- Keep section header and create form in `sidebar.tsx`.

---

## AI rooms: sortable tree with reparenting

One `DndContext` wraps the entire `RoomsTree`. One `SortableContext` per sibling group (root group and each set of children).

### Changes to `rooms-tree.tsx`

State: `nodes: RoomNode[]` (local copy for optimistic updates). `activeId`, `dragMode` ref, `nestTargetId` ref, `nestTimer` ref — same pattern as My rooms.

`DndContext` receives `onDragMove` and `onDragEnd` at the tree level.

**`onDragMove`**: Determine what `active` is hovering over. If hovering over a room row's name area (not the grip), start or continue the nest timer. If hovering over a gap (between rows), clear the timer and set `dragMode = 'reorder'`. Track `nestTargetId`.

**`onDragEnd`**:
1. Clear timer. Read `dragMode` and `nestTargetId`.
2. If `'reorder'`: find the sibling group by walking `nodes` to locate `active.id`. `arrayMove` within that group. Update `nodes` state. Fire `reorderRooms(workspaceId, newOrder, parentRoomId)`.
3. If `'nest'`: find `active.id` node. Find `nestTargetId` node. Check depth cap (if `nestTargetId` has a `parent_room_id`, reject). Optimistically move the node in local state. Fire `reparentRoom(workspaceId, active.id, nestTargetId)`. On failure, revert.
4. Reset refs.

**`RoomRow` changes**:
- Wrap with `useSortable({ id: node.id })`.
- Apply transform/transition.
- `isDragging`: `opacity-40`.
- `isNestTarget`: `bg-accent ring-1 ring-primary/30 rounded`.
- `isReorderTarget`: `border-t-2 border-primary`.
- `GripVertical` on hover (same pattern as My rooms).
- Grip sits left of row content. Add `pl-1` to the grip container, keep `px-2` on text area.
- Existing hover menu (rename, move, archive) unchanged.

**Depth cap during drag**: when `active.id` node has children (`node.children.length > 0`), set a `isDraggingParent` flag on `DndContext` state. Pass it down. `RoomRow` receives it and when `isDraggingParent` is true and the row is a child room, render `opacity-40` on nest hover and never set `isNestTarget`.

---

## Sensors

Use `PointerSensor` with activation constraint `{ distance: 5 }` everywhere. Short taps still navigate. Drag only starts after 5px of movement.

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
)
```

---

## Files changed

- `supabase/migrations/20260527000004_rooms_sidebar_order.sql` (new)
- `lib/queries/cockpit.ts` (sidebar_order in order clauses, MyRoom interface)
- `lib/rooms/actions.ts` (add reorderRooms and reparentRoom)
- `components/nav/sortable-my-rooms.tsx` (new)
- `components/nav/sidebar.tsx` (replace inline My rooms list with SortableMyRooms)
- `components/nav/rooms-tree.tsx` (DndContext wrap, SortableContext per sibling group, RoomRow useSortable, reparent logic)

---

## What this is NOT

- Not moving rooms between sections. A My room cannot be dragged into AI rooms and vice versa.
- Not unlimited depth. Max 2 levels. A room with children cannot be nested inside another room. A child cannot be nested inside another child.
- Not affecting sort order on any other view (home cards, search results, etc.).
- Not a replacement for the Move dialog. The Move dialog still exists for accessibility and for moves that require selecting a target by name rather than by drag.
