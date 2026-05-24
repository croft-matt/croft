'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface ActionResult {
  success: boolean
  error?: string
}

export async function acceptBlock(roomId: string, blockType: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('workspace_id')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found.' }

  // Find the next position: max position among active rows + 1, or 0 if none.
  const { data: existing } = await supabase
    .from('room_blocks')
    .select('position')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { error } = await supabase.from('room_blocks').upsert(
    {
      workspace_id: room.workspace_id,
      room_id: roomId,
      block_type: blockType,
      status: 'active',
      position: nextPosition,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id,block_type' },
  )

  if (error) return { success: false, error: error.message }
  revalidatePath(`/rooms/${roomId}`)
  return { success: true }
}

export async function dismissBlock(roomId: string, blockType: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('workspace_id')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found.' }

  const { error } = await supabase.from('room_blocks').upsert(
    {
      workspace_id: room.workspace_id,
      room_id: roomId,
      block_type: blockType,
      status: 'dismissed',
      position: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'room_id,block_type' },
  )

  if (error) return { success: false, error: error.message }
  revalidatePath(`/rooms/${roomId}`)
  return { success: true }
}

export async function moveBlock(
  roomId: string,
  blockType: string,
  position: number,
): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('room_blocks')
    .update({ position, updated_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('block_type', blockType)
    .eq('status', 'active')

  if (error) return { success: false, error: error.message }
  return { success: true }
}
