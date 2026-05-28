import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  // Single query replaces the previous two-step fetch (room_emails then emails).
  // PostgREST traverses the room_emails.email_id FK to pull received_at inline.
  // The result also provides the email_id needed for overdue room mapping below.
  const { data: roomEmailDates } = await supabase
    .from('room_emails')
    .select('room_id, email_id, emails!email_id(received_at)')
    .in('room_id', roomIds)

  const lastEmailByRoom: Record<string, string> = {}
  const emailToRooms: Record<string, string[]> = {}

  for (const re of roomEmailDates ?? []) {
    const t = (re.emails as { received_at: string } | null)?.received_at
    if (t && (!lastEmailByRoom[re.room_id] || t > lastEmailByRoom[re.room_id])) {
      lastEmailByRoom[re.room_id] = t
    }
    if (!emailToRooms[re.email_id]) emailToRooms[re.email_id] = []
    emailToRooms[re.email_id].push(re.room_id)
  }

  // Query overdue jobs directly by workspace_id to avoid an unbounded IN list.
  // Uses the existing jobs(workspace_id, status) composite index.
  const overdueRoomIds = new Set<string>()
  const { data: overdueJobs } = await supabase
    .from('jobs')
    .select('email_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', now)

  if (overdueJobs && overdueJobs.length > 0) {
    const overdueEmailIds = new Set(overdueJobs.map((j) => j.email_id))
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

export interface MyRoom {
  id: string
  name: string
  description: string | null
  created_at: string
  sidebar_order: number | null
}

// Returns rooms the user created manually (created_by is not null).
// Ordered by sidebar_order first (nulls last), then created_at desc as tiebreak.
export async function getMyRooms(workspaceId: string): Promise<MyRoom[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('rooms')
    .select('id, name, description, created_at, sidebar_order')
    .eq('workspace_id', workspaceId)
    .not('created_by', 'is', null)
    .is('archived_at', null)
    .order('sidebar_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as MyRoom[]
}

// Fetches the rooms tree using the admin client (no cookies needed).
// Workspace membership is verified in the app layout before this is called,
// so bypassing RLS here is safe. Called only via the cached wrapper below.
async function fetchRoomsTree(workspaceId: string): Promise<RoomWithOverdue[]> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('sidebar_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (!rooms || rooms.length === 0) return []

  const roomIds = rooms.map((r) => r.id)

  const { data: reRows } = await supabase
    .from('room_emails')
    .select('room_id, email_id')
    .in('room_id', roomIds)

  // Query overdue jobs directly by workspace_id to avoid an unbounded IN list.
  // Uses the existing jobs(workspace_id, status) composite index.
  const overdueRoomIds = new Set<string>()
  const { data: overdueJobs } = await supabase
    .from('jobs')
    .select('email_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', now)

  if (overdueJobs && overdueJobs.length > 0) {
    const overdueEmailIds = new Set(overdueJobs.map((j) => j.email_id))
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

// Cached wrapper around fetchRoomsTree.
// revalidate: 60 provides a time-based fallback for background pipeline writes
// (synthesiseRoom updates progress_total/progress_closed, fileEmailToRooms
// creates rooms) which run in Trigger.dev and cannot call revalidateTag.
// User-initiated room mutations call revalidateTag('rooms-tree') for immediate
// invalidation without waiting for the TTL.
export function getRoomsTree(workspaceId: string): Promise<RoomWithOverdue[]> {
  return unstable_cache(fetchRoomsTree, ['rooms-tree', workspaceId], {
    tags: ['rooms-tree'],
    revalidate: 60,
  })(workspaceId)
}
