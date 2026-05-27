# Brief 50: Sidebar Drag Reorder

## Goal

Let users reorder rooms in both sidebar sections by dragging. My rooms rows can be dragged into any order. AI-created rooms in the Rooms section can be reordered within their sibling group (root rooms among root rooms, children of a room among its children). No reparenting in this brief.

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

No default. Existing rooms get null, which falls back to the current sort order until a user drags something.

---

## Server action: reorderRooms

Add to `lib/rooms/actions.ts`:

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
- Batch as individual updates (no upsert needed, single-digit rows maximum).
- Call `revalidatePath('/', 'layout')`.
- Return `{ success: true }`.

No optimistic state needed server-side. The client handles optimistic reorder locally (see below).

---

## Query changes

### `lib/queries/cockpit.ts`

**`getMyRooms`**: Add `sidebar_order` to select. Change order to:
```ts
.order('sidebar_order', { ascending: true, nullsFirst: false })
.order('created_at', { ascending: false })
```

**`getRoomsTree`**: Add `sidebar_order` to select (already selects `*` so no change to the select itself). Change order to:
```ts
.order('sidebar_order', { ascending: true, nullsFirst: false })
.order('created_at', { ascending: true })
```

The tree builder (`buildTree` in `rooms-tree.tsx`) already groups by `parent_room_id`, so sibling order from the query is preserved per group.

**`MyRoom` interface**: Add `sidebar_order: number | null`.

`RoomWithOverdue` extends `Room`, which comes from generated types. After Matt runs the migration and regenerates types, `sidebar_order` will be present automatically on `Room` and therefore `RoomWithOverdue`. No manual change needed to the interface.

---

## My rooms: SortableMyRooms component

Extract the My rooms list out of `sidebar.tsx` into `components/nav/sortable-my-rooms.tsx`.

```ts
'use client'

import { useState, useTransition } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { reorderRooms } from '@/lib/rooms/actions'
import type { MyRoom } from '@/lib/queries/cockpit'
```

Props: `{ initialRooms: MyRoom[], workspaceId: string }`.

State: `rooms` (local copy of `initialRooms` for optimistic reorder).

On `DragEndEvent`:
1. Find `oldIndex` and `newIndex` from the event.
2. Call `arrayMove(rooms, oldIndex, newIndex)` and set state immediately (optimistic).
3. Fire `reorderRooms(workspaceId, newOrder.map(r => r.id), 'my-rooms')` in a transition. On failure, revert state.

Each sortable row (`SortableMyRoomRow`):
- Uses `useSortable({ id: room.id })`.
- Apply `transform: CSS.Transform.toString(transform)` and `transition` to the row element.
- `isDragging` state: set `opacity-40` on the dragged row.
- Show `GripVertical` (h-3 w-3, `cursor-grab`) on hover, hidden by default. Use `group` on the row and `group-hover:opacity-100 opacity-0` on the icon.
- Keep the existing Link and description rendering from `sidebar.tsx`.

Drop indicator: use the `DragOverlay` from `@dnd-kit/core` to render a semi-transparent clone of the dragged row floating under the cursor. The target slot shows a 1px blue top border (`border-t-2 border-primary`) when `isOver` is true on the target's `useSortable`.

In `sidebar.tsx`:
- Remove the inline My rooms list rendering.
- Import and render `<SortableMyRooms initialRooms={myRooms} workspaceId={workspaceId} />`.
- Keep the section header and create form as-is in `sidebar.tsx` — only the list moves.

---

## AI rooms: sortable tree

The tree has sibling groups at multiple depths. Use one `DndContext` wrapping the entire `RoomsTree` and one `SortableContext` per sibling group.

### Changes to `rooms-tree.tsx`

Wrap the root render in `DndContext`. Pass `onDragEnd` at the tree level.

```ts
function handleDragEnd(event: DragEndEvent, siblings: RoomNode[], parentRoomId: string | null) {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = siblings.findIndex(n => n.id === active.id)
  const newIndex = siblings.findIndex(n => n.id === over.id)
  if (oldIndex === -1 || newIndex === -1) return
  const newOrder = arrayMove(siblings, oldIndex, newIndex)
  // optimistic: update local state
  // then call reorderRooms(workspaceId, newOrder.map(r => r.id), parentRoomId)
}
```

Because each sibling group needs its own handler (different `siblings` arrays and `parentRoomId` values), pass a `onSiblingDragEnd` callback from `RoomsTree` down to the component that renders each sibling group.

The cleanest split: keep `DndContext` at the `RoomsTree` level but render each sibling list inside its own `SortableContext`. Pass the list of sibling IDs to each `SortableContext`.

State in `RoomsTree`: `nodes: RoomNode[]` (local copy for optimistic reorder). On `onDragEnd`, determine which sibling group the dragged item belongs to, call `arrayMove` on that group, update state, then fire the server action.

To determine the sibling group from `active.id`: walk `nodes` tree to find the node and its parent. This traversal is O(n) over a small tree — fine.

`RoomRow` changes:
- Wrap the row `div` with `useSortable({ id: node.id })`.
- Apply transform/transition as with My rooms.
- Show `GripVertical` on hover (same pattern: `group` + `group-hover:opacity-100 opacity-0`).
- `isDragging`: `opacity-40`.
- The existing hover menu (rename, move, archive) stays. The grip icon sits to the left of the row content. Shift existing padding slightly: add a `pl-1` to the grip and keep `px-2` on the text area.

---

## UX details

**Drag handle**: `GripVertical` (h-3 w-3), muted foreground colour, appears on hover via `group-hover:opacity-100 opacity-0 transition-opacity`. Cursor is `cursor-grab` on the handle element only, not the whole row.

**Dragging state**: The dragged row becomes `opacity-40` in place. The `DragOverlay` renders a full-opacity clone of the row with a subtle `shadow-md` and `ring-1 ring-primary/20` to distinguish it as floating.

**Drop indicator**: When `isOver` is true on a `useSortable` row, apply `border-t-2 border-primary` to show the insertion point above it. No indicator below the last item (dnd-kit handles this via index comparison).

**Sensors**: Use `PointerSensor` with an activation constraint of `{ distance: 5 }` so that short taps (link navigation) still work without accidentally starting a drag:

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
)
```

**Transition**: Apply `transition: CSS.Transition.toString(transition)` when not dragging. This gives the smooth slide-into-place animation dnd-kit provides by default.

---

## Files changed

- `supabase/migrations/20260527000004_rooms_sidebar_order.sql` (new)
- `lib/queries/cockpit.ts` (sidebar_order in order clauses + MyRoom interface)
- `lib/rooms/actions.ts` (add reorderRooms)
- `components/nav/sortable-my-rooms.tsx` (new)
- `components/nav/sidebar.tsx` (replace inline list with SortableMyRooms)
- `components/nav/rooms-tree.tsx` (DndContext wrap + SortableContext per sibling group + RoomRow useSortable)

---

## What this is NOT

- Not reparenting. Dragging a child room does not change its parent. Moving between sections (My rooms to AI Rooms) is not supported. That stays in the Move dialog.
- Not persisting drag order across sections. My rooms order is independent of AI rooms order.
- Not affecting the sort order on any other view (room cards on home, search results, etc.).
