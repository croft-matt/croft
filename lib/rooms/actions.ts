'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface RoomActionResult {
  success: boolean
  error?: string
}

// Rename a room. Trims whitespace. Rejects an empty name.
export async function renameRoom(
  roomId: string,
  newName: string,
): Promise<RoomActionResult> {
  await requireUser()
  const trimmed = newName.trim()
  if (!trimmed) return { success: false, error: 'Name cannot be empty.' }

  const supabase = await createClient()

  const { error } = await supabase
    .from('rooms')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', roomId)

  if (error) return { success: false, error: error.message }

  // Flush the sidebar tree (layout) and the room page in one call.
  revalidatePath('/', 'layout')
  return { success: true }
}

// Move a room to a new parent (or to root if newParentId is null).
// Rejects moves that would create a cycle (moving a room under one of its descendants).
// Also rejects a no-op (moving to the current parent).
export async function moveRoom(
  roomId: string,
  newParentId: string | null,
): Promise<RoomActionResult> {
  await requireUser()

  if (newParentId === roomId) {
    return { success: false, error: 'A room cannot be its own parent.' }
  }

  const supabase = await createClient()

  // Load the room to check current parent and workspace scope.
  const { data: room } = await supabase
    .from('rooms')
    .select('parent_room_id, workspace_id')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found.' }

  if (room.parent_room_id === newParentId) {
    return { success: false, error: 'Room is already in that location.' }
  }

  // Cycle detection: collect the full descendant set of roomId, then reject
  // if newParentId is among them.
  if (newParentId !== null) {
    const { data: allRooms } = await supabase
      .from('rooms')
      .select('id, parent_room_id')
      .eq('workspace_id', room.workspace_id)
      .is('archived_at', null)

    const descendants = new Set<string>()

    function collectDescendants(parentId: string): void {
      for (const r of allRooms ?? []) {
        if (r.parent_room_id === parentId) {
          descendants.add(r.id)
          collectDescendants(r.id)
        }
      }
    }

    collectDescendants(roomId)

    if (descendants.has(newParentId)) {
      return { success: false, error: 'Cannot move a room into one of its own sub-rooms.' }
    }
  }

  const { error } = await supabase
    .from('rooms')
    .update({ parent_room_id: newParentId, updated_at: new Date().toISOString() })
    .eq('id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Soft-delete a room by setting archived_at.
// Children of the archived room are not archived -- they surface at root.
// The rooms tree query filters on archived_at IS NULL so the room disappears
// from the sidebar immediately after revalidation.
export async function archiveRoom(roomId: string): Promise<RoomActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('rooms')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}
