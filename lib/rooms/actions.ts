'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface RoomActionResult {
  success: boolean
  error?: string
}

// Persists a new sidebar order for a sibling group.
// orderedIds: all room IDs in the group, in the new display order.
// parentRoomId: null for root rooms in AI section, the parent's ID for children.
//   Pass 'my-rooms' as a sentinel for the My rooms section (created_by is not null).
export async function reorderRooms(
  workspaceId: string,
  orderedIds: string[],
  parentRoomId: string | null | 'my-rooms',
): Promise<RoomActionResult> {
  await requireUser()
  const supabase = await createClient()

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase
      .from('rooms')
      .update({ sidebar_order: i })
      .eq('id', orderedIds[i])
      .eq('workspace_id', workspaceId)
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Moves a room under a new parent (or to root) via drag-and-drop.
// Depth guard: max 2 levels (root + one level of children).
// If newParentId itself has a parent_room_id, the move is rejected.
export async function reparentRoom(
  workspaceId: string,
  roomId: string,
  newParentId: string | null,
): Promise<RoomActionResult> {
  await requireUser()

  if (newParentId === roomId) {
    return { success: false, error: 'A room cannot be its own parent.' }
  }

  const supabase = await createClient()

  // Depth cap: reject if the target parent is itself a child room.
  if (newParentId !== null) {
    const { data: target } = await supabase
      .from('rooms')
      .select('parent_room_id')
      .eq('id', newParentId)
      .eq('workspace_id', workspaceId)
      .single()

    if (!target) return { success: false, error: 'Target room not found.' }
    if (target.parent_room_id !== null) return { success: false, error: 'max_depth' }
  }

  // Null out sidebar_order so the room lands naturally at the end of its new sibling group.
  const { error } = await supabase
    .from('rooms')
    .update({ parent_room_id: newParentId, sidebar_order: null, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('workspace_id', workspaceId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Creates a new room manually. Sets created_by to the authenticated user's ID.
// The description is stored as a routing hint for Tier 3.
export async function createRoom(
  workspaceId: string,
  name: string,
  description: string | null,
): Promise<RoomActionResult & { roomId?: string }> {
  const user = await requireUser()
  const trimmedName = name.trim()
  if (!trimmedName) return { success: false, error: 'Name cannot be empty.' }

  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      workspace_id: workspaceId,
      name: trimmedName,
      description: description?.trim() || null,
      created_by: user.id,
      room_data: {},
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true, roomId: data.id }
}

// Update the description on a room. Passing null or empty string clears it.
export async function updateRoomDescription(
  roomId: string,
  description: string | null,
): Promise<RoomActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('rooms')
    .update({
      description: description?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
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

// Hard-removes a room by setting status = 'deleted' and archived_at.
// The room disappears from the sidebar (archived_at filter) and is excluded
// from status-based queries. Does not cascade to child rooms or emails.
export async function removeRoom(roomId: string): Promise<RoomActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('rooms')
    .update({
      status: 'deleted',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Merges the source room into the target room by moving all room_emails associations.
// Emails already in the target room are skipped (on conflict ignore).
// The source room is removed after the move.
export async function mergeRoom(
  sourceRoomId: string,
  targetRoomId: string,
): Promise<RoomActionResult> {
  await requireUser()

  if (sourceRoomId === targetRoomId) {
    return { success: false, error: 'Cannot merge a room into itself.' }
  }

  const supabase = await createClient()

  // Fetch source room_emails to move.
  const { data: sourceEmails, error: fetchError } = await supabase
    .from('room_emails')
    .select('email_id, source')
    .eq('room_id', sourceRoomId)

  if (fetchError) return { success: false, error: fetchError.message }

  if (sourceEmails && sourceEmails.length > 0) {
    // Insert source emails into target, ignoring conflicts (email already in target).
    const rows = sourceEmails.map((row) => ({
      room_id: targetRoomId,
      email_id: row.email_id,
      source: row.source,
    }))

    const { error: insertError } = await supabase
      .from('room_emails')
      .upsert(rows, { onConflict: 'room_id,email_id', ignoreDuplicates: true })

    if (insertError) return { success: false, error: insertError.message }
  }

  // Remove the source room.
  const removeResult = await removeRoom(sourceRoomId)
  if (!removeResult.success) return removeResult

  revalidatePath('/', 'layout')
  return { success: true }
}
