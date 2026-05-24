import { createClient } from '@/lib/supabase/server'
import type { Email, Job, Room } from '@/lib/types/database'

// Room type extended with overdue flag — used by rooms tree and cockpit room cards.
export interface RoomWithOverdue extends Room {
  has_overdue: boolean
}

// Room type extended with last email time and overdue flag — used by cockpit room cards.
export interface RoomCardRow extends RoomWithOverdue {
  last_email_at: string | null
}

export async function getUrgentEmails(workspaceId: string): Promise<Email[]> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('emails')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('urgency_score', 7)
    .eq('processing_state', 'processed')
    .gte('received_at', cutoff)
    .order('urgency_score', { ascending: false })
    .order('received_at', { ascending: false })
    .limit(8)

  return (data ?? []) as Email[]
}

// Returns email_id -> first room name mapping for a set of email IDs.
export async function getEmailRoomNames(emailIds: string[]): Promise<Record<string, string>> {
  if (emailIds.length === 0) return {}
  const supabase = await createClient()

  const { data } = await supabase
    .from('room_emails')
    .select('email_id, rooms(name)')
    .in('email_id', emailIds)

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (!map[row.email_id]) {
      const name = (row.rooms as { name: string } | null)?.name
      if (name) map[row.email_id] = name
    }
  }
  return map
}

export interface OverdueJobRow extends Job {
  from_name: string | null
  room_id: string | null
  room_name: string | null
}

export async function getOverdueJobs(workspaceId: string): Promise<OverdueJobRow[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, emails!email_id(from_name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', now)
    .order('due', { ascending: true })
    .limit(10)

  if (!jobs || jobs.length === 0) return []

  const emailIds = [...new Set(jobs.map((j) => j.email_id))]
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { room_id: string; room_name: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const name = (re.rooms as { name: string } | null)?.name
      if (name) roomByEmail[re.email_id] = { room_id: re.room_id, room_name: name }
    }
  }

  return jobs.map((j) => ({
    ...(j as Job),
    from_name: (j.emails as { from_name: string | null } | null)?.from_name ?? null,
    room_id: roomByEmail[j.email_id]?.room_id ?? null,
    room_name: roomByEmail[j.email_id]?.room_name ?? null,
  }))
}

export async function getActiveRooms(workspaceId: string): Promise<RoomCardRow[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(12)

  if (!rooms || rooms.length === 0) return []

  const roomIds = rooms.map((r) => r.id)

  // Fetch all room_email rows for these rooms in one query.
  const { data: reRows } = await supabase
    .from('room_emails')
    .select('room_id, email_id')
    .in('room_id', roomIds)

  const allEmailIds = [...new Set((reRows ?? []).map((r) => r.email_id))]

  // Fetch received_at for those emails to compute last_email_at per room.
  const { data: emailDates } = allEmailIds.length > 0
    ? await supabase
        .from('emails')
        .select('id, received_at')
        .in('id', allEmailIds)
    : { data: [] }

  const receivedAtById: Record<string, string> = {}
  for (const e of emailDates ?? []) receivedAtById[e.id] = e.received_at

  const lastEmailByRoom: Record<string, string> = {}
  for (const re of reRows ?? []) {
    const t = receivedAtById[re.email_id]
    if (t && (!lastEmailByRoom[re.room_id] || t > lastEmailByRoom[re.room_id])) {
      lastEmailByRoom[re.room_id] = t
    }
  }

  // Find which rooms have overdue open jobs.
  const overdueRoomIds = new Set<string>()
  if (allEmailIds.length > 0) {
    const { data: overdueJobs } = await supabase
      .from('jobs')
      .select('email_id')
      .in('email_id', allEmailIds)
      .eq('status', 'open')
      .lt('due', now)

    const overdueEmailIds = new Set((overdueJobs ?? []).map((j) => j.email_id))
    const emailToRooms: Record<string, string[]> = {}
    for (const re of reRows ?? []) {
      if (!emailToRooms[re.email_id]) emailToRooms[re.email_id] = []
      emailToRooms[re.email_id].push(re.room_id)
    }
    for (const emailId of overdueEmailIds) {
      for (const roomId of emailToRooms[emailId] ?? []) {
        overdueRoomIds.add(roomId)
      }
    }
  }

  return (rooms as Room[]).map((r) => ({
    ...r,
    last_email_at: lastEmailByRoom[r.id] ?? null,
    has_overdue: overdueRoomIds.has(r.id),
  }))
}

export async function getProcessingCount(
  workspaceId: string
): Promise<{ processing: number; failed: number }> {
  const supabase = await createClient()

  const [{ count: processing }, { count: failed }] = await Promise.all([
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('processing_state', ['received', 'urgency_scanned', 'queued', 'processing']),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('processing_state', 'failed'),
  ])

  return { processing: processing ?? 0, failed: failed ?? 0 }
}

export async function getRoomsTree(workspaceId: string): Promise<RoomWithOverdue[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (!rooms || rooms.length === 0) return []

  const roomIds = rooms.map((r) => r.id)

  const { data: reRows } = await supabase
    .from('room_emails')
    .select('room_id, email_id')
    .in('room_id', roomIds)

  const allEmailIds = [...new Set((reRows ?? []).map((r) => r.email_id))]
  const overdueRoomIds = new Set<string>()

  if (allEmailIds.length > 0) {
    const { data: overdueJobs } = await supabase
      .from('jobs')
      .select('email_id')
      .in('email_id', allEmailIds)
      .eq('status', 'open')
      .lt('due', now)

    const overdueEmailIds = new Set((overdueJobs ?? []).map((j) => j.email_id))
    const emailToRooms: Record<string, string[]> = {}
    for (const re of reRows ?? []) {
      if (!emailToRooms[re.email_id]) emailToRooms[re.email_id] = []
      emailToRooms[re.email_id].push(re.room_id)
    }
    for (const emailId of overdueEmailIds) {
      for (const roomId of emailToRooms[emailId] ?? []) {
        overdueRoomIds.add(roomId)
      }
    }
  }

  return (rooms as Room[]).map((r) => ({
    ...r,
    has_overdue: overdueRoomIds.has(r.id),
  }))
}
