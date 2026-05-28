import { createClient } from '@/lib/supabase/server'

export interface AllEmailsRow {
  id: string
  threadId: string | null
  fromName: string | null
  fromAddress: string
  subject: string
  subjectSummary: string | null
  receivedAt: string
  processingState: string
  urgencyScore: number | null
  roomId: string | null
  roomName: string | null
  jobCount: number
  source: string
}

export async function getAllEmails(workspaceId: string): Promise<AllEmailsRow[]> {
  const supabase = await createClient()

  const { data: emails } = await supabase
    .from('emails')
    .select(
      'id, thread_id, from_name, from_address, subject, subject_summary, received_at, processing_state, urgency_score, source'
    )
    .eq('workspace_id', workspaceId)
    .neq('processing_state', 'ignored')
    .order('received_at', { ascending: false })
    .limit(200)

  if (!emails || emails.length === 0) return []

  // Deduplicate by thread_id — keep the most recent per thread (already sorted desc)
  const seen = new Set<string>()
  const deduped: typeof emails = []
  for (const email of emails) {
    const key = email.thread_id ?? email.id
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(email)
    }
  }
  const top100 = deduped.slice(0, 100)
  const emailIds = top100.map((e) => e.id)

  // Room info via room_emails join
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

  // Job counts per email
  const { data: jobs } = await supabase
    .from('jobs')
    .select('email_id')
    .in('email_id', emailIds)
    .eq('workspace_id', workspaceId)

  const jobCountByEmail = new Map<string, number>()
  for (const job of jobs ?? []) {
    if (job.email_id) {
      jobCountByEmail.set(job.email_id, (jobCountByEmail.get(job.email_id) ?? 0) + 1)
    }
  }

  return top100.map((email) => {
    const room = roomByEmail.get(email.id)
    return {
      id: email.id,
      threadId: email.thread_id ?? null,
      fromName: email.from_name ?? null,
      fromAddress: email.from_address,
      subject: email.subject ?? '(no subject)',
      subjectSummary: email.subject_summary ?? null,
      receivedAt: email.received_at,
      processingState: email.processing_state,
      urgencyScore: email.urgency_score ?? null,
      roomId: room?.roomId ?? null,
      roomName: room?.roomName ?? null,
      jobCount: jobCountByEmail.get(email.id) ?? 0,
      source: email.source ?? 'inbound',
    }
  })
}
