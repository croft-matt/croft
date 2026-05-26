import { createClient } from '@/lib/supabase/server'
import type { Room, Job, Asset, Contact, Email } from '@/lib/types/database'

export async function getRoomById(id: string): Promise<Room | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single()
  return (data as Room) ?? null
}

export async function getChildRooms(parentId: string): Promise<Room[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('parent_room_id', parentId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
  return (data ?? []) as Room[]
}

export async function getEmailIdsForRoom(roomId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)
  return (data ?? []).map((r) => r.email_id)
}

// Accepts an optional pre-fetched emailIds list to avoid a redundant
// room_emails query when the caller already has the ids (e.g. the room page).
export async function getJobsForRoom(roomId: string, emailIds?: string[]): Promise<Job[]> {
  const supabase = await createClient()
  const ids = emailIds ?? (await getEmailIdsForRoom(roomId))
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('jobs')
    .select('*')
    .in('email_id', ids)
    .order('created_at', { ascending: true })
  return (data ?? []) as Job[]
}

// Accepts an optional pre-fetched emailIds list to avoid a redundant
// room_emails query when the caller already has the ids.
export async function getAssetsForRoom(roomId: string, emailIds?: string[]): Promise<Asset[]> {
  const supabase = await createClient()
  const ids = emailIds ?? (await getEmailIdsForRoom(roomId))
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('assets')
    .select('*')
    .in('email_id', ids)
    .order('created_at', { ascending: false })
  return (data ?? []) as Asset[]
}

export async function getContactsForRoom(roomId: string): Promise<Contact[]> {
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('workspace_id')
    .eq('id', roomId)
    .single()
  if (!room) return []

  const { data: reRows } = await supabase
    .from('room_emails')
    .select('email_id, emails(from_address, to_addresses, cc_addresses)')
    .eq('room_id', roomId)

  const addresses = new Set<string>()
  for (const re of reRows ?? []) {
    const email = re.emails as {
      from_address: string
      to_addresses: unknown
      cc_addresses: unknown
    } | null
    if (!email) continue
    addresses.add(email.from_address)
    const toArr = Array.isArray(email.to_addresses) ? email.to_addresses : []
    const ccArr = Array.isArray(email.cc_addresses) ? email.cc_addresses : []
    for (const a of toArr) if (typeof a === 'string') addresses.add(a)
    for (const a of ccArr) if (typeof a === 'string') addresses.add(a)
  }

  if (addresses.size === 0) return []

  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('workspace_id', room.workspace_id)
    .in('email_address', [...addresses])
    .order('last_seen_at', { ascending: false })
  return (data ?? []) as Contact[]
}

// Accepts an optional pre-fetched emailIds list to avoid a redundant
// room_emails query when the caller already has the ids.
export async function getEmailsForRoom(roomId: string, limit = 50, emailIds?: string[]): Promise<Email[]> {
  const supabase = await createClient()
  const ids = emailIds ?? (await getEmailIdsForRoom(roomId))
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('emails')
    .select('*')
    .in('id', ids)
    .order('received_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as Email[]
}

export interface CrossReference {
  id: string
  room_id_a: string
  room_id_b: string
  reason: string
  linked_room_id: string
  linked_room_name: string
}

// Returns a lightweight list of all active rooms for the workspace.
// Used by the move-room dialog and room header menu to populate the room picker.
export async function getAllActiveRooms(
  workspaceId: string,
): Promise<Array<{ id: string; name: string; parent_room_id: string | null }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rooms')
    .select('id, name, parent_room_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('name')
  return data ?? []
}

// Returns cross-references for a room. Safe to call before the
// room_cross_references table exists — returns [] on any error.
export async function getCrossReferences(roomId: string): Promise<CrossReference[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('room_cross_references' as never)
      .select('id, room_id_a, room_id_b, reason, rooms!room_id_b(id, name)')
      .or(`room_id_a.eq.${roomId},room_id_b.eq.${roomId}`)
      .limit(5)

    if (error || !data) return []

    return (data as unknown[]).map((row) => {
      const r = row as {
        id: string
        room_id_a: string
        room_id_b: string
        reason: string
        rooms: { id: string; name: string }
      }
      const linkedId = r.room_id_a === roomId ? r.room_id_b : r.room_id_a
      return {
        id: r.id,
        room_id_a: r.room_id_a,
        room_id_b: r.room_id_b,
        reason: r.reason,
        linked_room_id: linkedId,
        linked_room_name: r.rooms?.name ?? '',
      }
    })
  } catch {
    return []
  }
}
