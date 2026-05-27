import { createAdminClient } from '@/lib/supabase/admin'
import type { Extraction } from '@/lib/types/database'

export type NotificationType = 'job_created' | 'job_updated' | 'job_closed' | 'email_received'

interface NotificationRow {
  workspace_id: string
  type: NotificationType
  summary: string
  room_id: string | null
  email_id: string | null
  job_id: string | null
}

function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

interface WriteNotificationsParams {
  workspaceId: string
  emailId: string
  fromName: string | null
  fromAddress: string
  extraction: Extraction
  matchedRoomIds: string[]
  // Jobs that were open before this email was processed — used to get descriptions
  // for jobs that get closed by this email.
  candidateJobs: Array<{ id: string; description: string }>
  candidateJobIds: Set<string>
}

export async function writeNotifications(params: WriteNotificationsParams): Promise<void> {
  const {
    workspaceId,
    emailId,
    fromName,
    fromAddress,
    extraction,
    matchedRoomIds,
    candidateJobs,
    candidateJobIds,
  } = params

  const supabase = createAdminClient()
  const rows: NotificationRow[] = []

  const senderLabel = fromName ?? fromAddress

  // Fetch room names once for all room-scoped notifications.
  let roomNameById: Map<string, string> = new Map()
  if (matchedRoomIds.length > 0) {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .in('id', matchedRoomIds)
    for (const r of rooms ?? []) roomNameById.set(r.id, r.name)
  }

  const primaryRoomId = matchedRoomIds[0] ?? null
  const primaryRoomName = primaryRoomId ? roomNameById.get(primaryRoomId) : null

  // 1. email_received — one notification per matched room.
  for (const roomId of matchedRoomIds) {
    const roomName = roomNameById.get(roomId) ?? 'a room'
    rows.push({
      workspace_id: workspaceId,
      type: 'email_received',
      summary: truncate(`New email from ${senderLabel} in ${roomName}`),
      room_id: roomId,
      email_id: emailId,
      job_id: null,
    })
  }

  // 2. job_created — one per new/chase_of job in this extraction.
  const candidateJobMap = new Map(candidateJobs.map((j) => [j.id, j.description]))

  for (const j of extraction.jobs ?? []) {
    if (j.intent === 'DELIVER' || j.intent === 'CONFIRM' || j.intent === 'INTRODUCE') continue
    const relation = j.relation ?? 'new'
    if (relation === 'duplicate') continue
    if (relation === 'update') continue // handled separately below

    rows.push({
      workspace_id: workspaceId,
      type: 'job_created',
      summary: truncate(`New job: ${j.description}`),
      room_id: primaryRoomId,
      email_id: emailId,
      job_id: null, // inserted job IDs not available here; job_id left null
    })
  }

  // 3. job_updated — one per update verdict.
  for (const j of extraction.jobs ?? []) {
    if ((j.relation ?? 'new') !== 'update') continue
    const targetId = j.relates_to_job_id && candidateJobIds.has(j.relates_to_job_id)
      ? j.relates_to_job_id
      : null
    if (!targetId) continue

    rows.push({
      workspace_id: workspaceId,
      type: 'job_updated',
      summary: truncate(`Updated: ${j.description}`),
      room_id: primaryRoomId,
      email_id: emailId,
      job_id: targetId,
    })
  }

  // 4. job_closed — one per closed job ID.
  const validClosesJobs = (extraction.closes_jobs ?? []).filter((id) => candidateJobIds.has(id))
  for (const jobId of validClosesJobs) {
    const desc = candidateJobMap.get(jobId)
    const summary = desc
      ? truncate(`Closed: ${desc}`)
      : 'A job was resolved'
    rows.push({
      workspace_id: workspaceId,
      type: 'job_closed',
      summary,
      room_id: primaryRoomId,
      email_id: emailId,
      job_id: jobId,
    })
  }

  if (rows.length === 0) return

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    console.error('writeNotifications: insert failed:', error.message)
  }
}
