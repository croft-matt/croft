import { createClient } from '@/lib/supabase/server'
import { getConnectedAddresses } from '@/lib/jobs/open-loops'

export interface AllJobsRow {
  id: string
  description: string
  due: string | null
  owner: string | null
  emailId: string
  roomId: string
  roomName: string
  isOverdue: boolean
  ageDays: number
}

export interface AllJobs {
  yourCourt: AllJobsRow[]
  theirCourt: AllJobsRow[]
}

export async function getAllJobs(
  workspaceId: string,
  limit = 50,
): Promise<AllJobs & { truncated: boolean }> {
  const supabase = await createClient()
  const now = new Date()

  const [connectedAddresses, { data: jobs }] = await Promise.all([
    getConnectedAddresses(workspaceId),
    supabase
      .from('jobs')
      .select('id, description, due, owner, email_id, emails!email_id(received_at)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .neq('source', 'anticipated')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (!jobs || jobs.length === 0) return { yourCourt: [], theirCourt: [], truncated: false }

  const connectedSet = new Set(connectedAddresses.map((a) => a.toLowerCase()))

  const emailIds = [...new Set(jobs.map((j) => j.email_id))]
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail = new Map<string, { roomId: string; roomName: string }>()
  for (const re of roomEmails ?? []) {
    if (!roomByEmail.has(re.email_id)) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail.set(re.email_id, { roomId: room.id, roomName: room.name })
    }
  }

  const yourCourt: AllJobsRow[] = []
  const theirCourt: AllJobsRow[] = []

  for (const job of jobs) {
    const room = roomByEmail.get(job.email_id)
    if (!room) continue

    const receivedAt =
      (job.emails as { received_at: string } | null)?.received_at ?? new Date().toISOString()
    const ageDays = Math.floor(
      (now.getTime() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    const isOverdue = job.due != null && new Date(job.due) < now

    const row: AllJobsRow = {
      id: job.id,
      description: job.description,
      due: job.due ?? null,
      owner: job.owner ?? null,
      emailId: job.email_id,
      roomId: room.roomId,
      roomName: room.roomName,
      isOverdue,
      ageDays,
    }

    const ownerLower = job.owner?.toLowerCase() ?? null
    if (ownerLower && connectedSet.has(ownerLower)) {
      yourCourt.push(row)
    } else {
      theirCourt.push(row)
    }
  }

  // Your court: overdue first, then newest first
  yourCourt.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return a.ageDays - b.ageDays
  })

  // Their court: newest first
  theirCourt.sort((a, b) => a.ageDays - b.ageDays)

  return { yourCourt, theirCourt, truncated: jobs.length === limit }
}
