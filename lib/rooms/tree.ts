// Shared tree-building utility for rooms.
// Used by the sidebar (components/nav/rooms-tree.tsx) and by
// formatRoomTree in lib/ai/tier3.ts.
//
// buildRoomTree accepts any array whose elements include the three
// required fields (id, name, parent_room_id). Extra fields (has_overdue,
// progress_total, etc.) pass through untouched, so the sidebar can
// call it with RoomWithOverdue[] and get back fully typed nodes.

export interface RoomRecord {
  id: string
  name: string
  parent_room_id: string | null
}

export interface RoomTreeNode extends RoomRecord {
  children: RoomTreeNode[]
  // True if any descendant leaf has an unread indicator.
  // Computed bottom-up after the tree is assembled. Used by the sidebar
  // to show an aggregated dot on a collapsed parent.
  hasUnreadDescendant: boolean
}

export function buildRoomTree(rooms: RoomRecord[]): RoomTreeNode[] {
  const byId = new Map<string, RoomTreeNode>(
    rooms.map((r) => [r.id, { ...r, children: [], hasUnreadDescendant: false }]),
  )

  const roots: RoomTreeNode[] = []

  for (const room of rooms) {
    const node = byId.get(room.id)!
    if (room.parent_room_id === null) {
      roots.push(node)
    } else {
      const parent = byId.get(room.parent_room_id)
      if (parent) {
        parent.children.push(node)
      } else {
        // Parent not found (archived or missing) — surface as root.
        roots.push(node)
      }
    }
  }

  // Sort children alphabetically at every level for a stable tree.
  function sortNode(node: RoomTreeNode): void {
    node.children.sort((a, b) => a.name.localeCompare(b.name))
    node.children.forEach(sortNode)
  }
  roots.sort((a, b) => a.name.localeCompare(b.name))
  roots.forEach(sortNode)

  // Compute hasUnreadDescendant bottom-up.
  // A node has an unread descendant if any child has an unread indicator
  // (detected via has_overdue on the raw room data) or itself has a true
  // hasUnreadDescendant. The sidebar passes RoomWithOverdue objects, so
  // we check has_overdue from the runtime data.
  function computeUnread(node: RoomTreeNode): boolean {
    const selfHasUnread = (node as unknown as Record<string, unknown>)['has_overdue'] === true
    const childHasUnread = node.children.some((c) => computeUnread(c))
    node.hasUnreadDescendant = selfHasUnread || childHasUnread
    return selfHasUnread || childHasUnread
  }
  roots.forEach(computeUnread)

  return roots
}
