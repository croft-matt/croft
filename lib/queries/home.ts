import { createClient } from '@/lib/supabase/server'
import type { Email, Job } from '@/lib/types/database'

// ─── Shared helper ────────────────────────────────────────────────────────────
// Given a set of room IDs, returns a map of roomId -> parent room name (or null).

async function getParentRoomNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomIds: string[]
): Promise<Record<string, string | null>> {
  if (roomIds.length === 0) return {}

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, parent_room_id')
    .in('id', roomIds)

  if (!rooms || rooms.length === 0) return {}

  const parentIds = [
    ...new Set(rooms.map((r) => r.parent_room_id).filter(Boolean)),
  ] as string[]

  if (parentIds.length === 0) {
    return Object.fromEntries(rooms.map((r) => [r.id, null]))
  }

  const { data: parents } = await supabase
    .from('rooms')
    .select('id, name')
    .in('id', parentIds)

  const parentNameById: Record<string, string> = {}
  for (const p of parents ?? []) parentNameById[p.id] = p.name

  const result: Record<string, string | null> = {}
  for (const r of rooms) {
    result[r.id] = r.parent_room_id ? (parentNameById[r.parent_room_id] ?? null) : null
  }
  return result
}

// ─── Waiting on you ───────────────────────────────────────────────────────────
// Emails where the AI flagged requires_response = true, sorted by response_by
// deadline ascending (most urgent deadline first), nulls last.

export interface WaitingEmail {
  id: string
  fromName: string | null
  fromAddress: string
  subjectSummary: string | null
  receivedAt: string
  responseBy: string | null
  roomId: string | null
  roomName: string | null
  parentRoomName: string | null
}

export async function getWaitingEmails(workspaceId: string): Promise<WaitingEmail[]> {
  const supabase = await createClient()

  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject_summary, received_at, response_by')
    .eq('workspace_id', workspaceId)
    .eq('requires_response', true)
    .eq('processing_state', 'processed')
    .order('response_by', { ascending: true, nullsFirst: false })
    .limit(20)

  if (!emails || emails.length === 0) return []

  const emailIds = emails.map((e) => e.id)
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  const roomIds = [
    ...new Set(Object.values(roomByEmail).map((r) => r.roomId)),
  ]
  const parentNames = await getParentRoomNames(supabase, roomIds)

  return emails.map((e) => {
    const room = roomByEmail[e.id]
    return {
      id: e.id,
      fromName: e.from_name,
      fromAddress: e.from_address,
      subjectSummary: e.subject_summary,
      receivedAt: e.received_at,
      responseBy: e.response_by,
      roomId: room?.roomId ?? null,
      roomName: room?.roomName ?? null,
      parentRoomName: room ? (parentNames[room.roomId] ?? null) : null,
    }
  })
}

// ─── Overdue jobs ─────────────────────────────────────────────────────────────
// Open jobs past their due date, sorted by most overdue first.

export interface OverdueJob {
  id: string
  description: string
  due: string
  emailId: string
  fromName: string | null
  roomId: string | null
  roomName: string | null
  parentRoomName: string | null
}

export async function getOverdueJobs(workspaceId: string): Promise<OverdueJob[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  // Only surface jobs overdue within the last 30 days. Anything older is stale
  // data that shouldn't dominate the home view.
  const floor = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, description, due, email_id, emails!email_id(from_name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', now)
    .gte('due', floor)
    .order('due', { ascending: true })
    .limit(20)

  if (!jobs || jobs.length === 0) return []

  const emailIds = [...new Set(jobs.map((j) => j.email_id))]
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  const roomIds = [
    ...new Set(Object.values(roomByEmail).map((r) => r.roomId)),
  ]
  const parentNames = await getParentRoomNames(supabase, roomIds)

  return jobs.map((j) => {
    const room = roomByEmail[j.email_id]
    return {
      id: j.id,
      description: j.description,
      due: j.due!,
      emailId: j.email_id,
      fromName: (j.emails as { from_name: string | null } | null)?.from_name ?? null,
      roomId: room?.roomId ?? null,
      roomName: room?.roomName ?? null,
      parentRoomName: room ? (parentNames[room.roomId] ?? null) : null,
    }
  })
}

// ─── Hot emails ───────────────────────────────────────────────────────────────
// High urgency-score emails from the last 48h. Still fetched for the realtime
// processing counter logic in home-realtime but no longer rendered as a section.

export interface HotEmail {
  id: string
  fromName: string | null
  fromAddress: string
  urgencyScore: number
  urgencyReason: string | null
  subjectSummary: string | null
  receivedAt: string
  roomId: string | null
  roomName: string | null
}

export async function getHotEmails(workspaceId: string): Promise<HotEmail[]> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, urgency_score, urgency_reason, subject_summary, received_at')
    .eq('workspace_id', workspaceId)
    .gte('urgency_score', 7)
    .eq('processing_state', 'processed')
    .gte('received_at', cutoff)
    .order('urgency_score', { ascending: false })
    .order('received_at', { ascending: false })
    .limit(20)

  if (!emails || emails.length === 0) return []

  const emailIds = emails.map((e) => e.id)
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  return emails.map((e) => ({
    id: e.id,
    fromName: e.from_name,
    fromAddress: e.from_address,
    urgencyScore: e.urgency_score ?? 7,
    urgencyReason: e.urgency_reason,
    subjectSummary: e.subject_summary,
    receivedAt: e.received_at,
    roomId: roomByEmail[e.id]?.roomId ?? null,
    roomName: roomByEmail[e.id]?.roomName ?? null,
  }))
}

// ─── Waiting on others ────────────────────────────────────────────────────────
// Open jobs where the owner is an external person (not one of the workspace's
// connected email addresses). Grouped by owner for the right-hand home column.

export interface WaitingOnOthersItem {
  jobId: string
  description: string
  emailId: string
  receivedAt: string
}

export interface WaitingOnOthersPerson {
  ownerAddress: string
  ownerName: string | null
  ownerOrg: string | null
  roomNames: string[]
  items: WaitingOnOthersItem[]
}

export async function getWaitingOnOthers(
  workspaceId: string
): Promise<WaitingOnOthersPerson[]> {
  const supabase = await createClient()

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const userAddresses = new Set(
    (accounts ?? []).map((a) => a.email_address.toLowerCase())
  )

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, description, email_id, owner, emails!email_id(received_at)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .not('owner', 'is', null)
    .limit(60)

  if (!jobs || jobs.length === 0) return []

  const external = jobs.filter(
    (j) => j.owner && !userAddresses.has((j.owner as string).toLowerCase())
  )
  if (external.length === 0) return []

  const emailIds = [...new Set(external.map((j) => j.email_id))]
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, rooms(name)')
    .in('email_id', emailIds)

  const roomNamesByEmail: Record<string, string[]> = {}
  for (const re of roomEmails ?? []) {
    const name = (re.rooms as { name: string } | null)?.name
    if (name) {
      if (!roomNamesByEmail[re.email_id]) roomNamesByEmail[re.email_id] = []
      if (!roomNamesByEmail[re.email_id].includes(name)) {
        roomNamesByEmail[re.email_id].push(name)
      }
    }
  }

  const ownerAddresses = [...new Set(external.map((j) => j.owner as string))]
  const { data: contacts } = await supabase
    .from('contacts')
    .select('email_address, name, organisation')
    .eq('workspace_id', workspaceId)
    .in('email_address', ownerAddresses)

  const contactByEmail: Record<string, { name: string | null; org: string | null }> = {}
  for (const c of contacts ?? []) {
    if (!contactByEmail[c.email_address]) {
      contactByEmail[c.email_address] = {
        name: c.name ?? null,
        org: c.organisation ?? null,
      }
    }
  }

  const byOwner: Record<string, WaitingOnOthersPerson> = {}
  for (const j of external) {
    const addr = (j.owner as string).toLowerCase()
    const originalAddr = j.owner as string
    const receivedAt =
      (j.emails as { received_at: string } | null)?.received_at ??
      new Date(0).toISOString()

    if (!byOwner[addr]) {
      const contact =
        contactByEmail[originalAddr] ?? contactByEmail[addr] ?? null
      byOwner[addr] = {
        ownerAddress: originalAddr,
        ownerName: contact?.name ?? null,
        ownerOrg: contact?.org ?? null,
        roomNames: [],
        items: [],
      }
    }

    byOwner[addr].items.push({
      jobId: j.id,
      description: j.description,
      emailId: j.email_id,
      receivedAt,
    })

    for (const name of roomNamesByEmail[j.email_id] ?? []) {
      if (!byOwner[addr].roomNames.includes(name)) {
        byOwner[addr].roomNames.push(name)
      }
    }
  }

  const persons = Object.values(byOwner)
  for (const p of persons) {
    p.items.sort(
      (a, b) =>
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    )
  }
  persons.sort(
    (a, b) =>
      new Date(a.items[0].receivedAt).getTime() -
      new Date(b.items[0].receivedAt).getTime()
  )

  return persons
}

// ─── Home summary counts ──────────────────────────────────────────────────────
// Four numbers for the stats strip. Fetched in a single parallel burst.

export interface HomeCounts {
  attentionCount: number
  waitingOnOthersCount: number
  activeRoomsCount: number
  closedThisWeekCount: number
}

export async function getHomeCounts(workspaceId: string): Promise<HomeCounts> {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const userAddresses = (accounts ?? []).map((a) => a.email_address)

  const othersQuery =
    userAddresses.length > 0
      ? supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('status', 'open')
          .not('owner', 'is', null)
          .not(
            'owner',
            'in',
            `(${userAddresses.map((a) => `"${a}"`).join(',')})`
          )
      : supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('status', 'open')
          .not('owner', 'is', null)

  const [
    { count: overdueCount },
    { count: waitingCount },
    { count: othersCount },
    { count: roomsCount },
    { count: closedCount },
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .lt('due', now),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('requires_response', true)
      .eq('processing_state', 'processed'),
    othersQuery,
    supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('archived_at', null),
    supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'closed')
      .gte('updated_at', weekAgo),
  ])

  return {
    attentionCount: (overdueCount ?? 0) + (waitingCount ?? 0),
    waitingOnOthersCount: othersCount ?? 0,
    activeRoomsCount: roomsCount ?? 0,
    closedThisWeekCount: closedCount ?? 0,
  }
}
