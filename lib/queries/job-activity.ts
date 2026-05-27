import { createClient } from '@/lib/supabase/server'

export interface JobActivityEvent {
  type: 'created' | 'chased' | 'updated' | 'closed'
  emailId: string
  fromName: string | null
  fromAddress: string
  subjectSummary: string | null
  receivedAt: string
}

export interface JobActivityData {
  id: string
  description: string
  status: string
  intent: string
  owner: string | null
  due: string | null
  roomName: string | null
  timeline: JobActivityEvent[]
}

export async function getJobActivity(jobId: string): Promise<JobActivityData | null> {
  const supabase = await createClient()

  // Fetch the job itself.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, description, status, intent, owner, due, email_id, closed_by_email_id')
    .eq('id', jobId)
    .single()

  if (!job) return null

  // Collect all email IDs that touched this job.
  const emailIdSet = new Set<string>()
  if (job.email_id) emailIdSet.add(job.email_id)
  if (job.closed_by_email_id) emailIdSet.add(job.closed_by_email_id)

  // Chase and update jobs that reference this job as parent/relates_to.
  const { data: relatedJobs } = await supabase
    .from('jobs')
    .select('id, intent, email_id')
    .or(`parent_job_id.eq.${jobId},relates_to_job_id.eq.${jobId}`)

  for (const rj of relatedJobs ?? []) {
    if (rj.email_id) emailIdSet.add(rj.email_id)
  }

  const emailIds = [...emailIdSet]

  // Fetch all emails in one shot.
  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject_summary, received_at')
    .in('id', emailIds)

  const emailById = new Map(
    (emails ?? []).map((e) => [e.id, e])
  )

  // Build the intent map for related jobs (to classify chase vs update events).
  const relatedIntentByEmailId = new Map<string, string>()
  for (const rj of relatedJobs ?? []) {
    if (rj.email_id) relatedIntentByEmailId.set(rj.email_id, rj.intent)
  }

  // Assemble the timeline.
  const timeline: JobActivityEvent[] = []

  for (const emailId of emailIds) {
    const email = emailById.get(emailId)
    if (!email) continue

    let type: JobActivityEvent['type']
    if (emailId === job.closed_by_email_id) {
      type = 'closed'
    } else if (emailId === job.email_id) {
      type = 'created'
    } else {
      const relIntent = relatedIntentByEmailId.get(emailId)
      type = relIntent === 'CHASE' ? 'chased' : 'updated'
    }

    timeline.push({
      type,
      emailId,
      fromName: email.from_name,
      fromAddress: email.from_address,
      subjectSummary: email.subject_summary,
      receivedAt: email.received_at,
    })
  }

  timeline.sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  )

  // Get room name from the source email.
  let roomName: string | null = null
  if (job.email_id) {
    const { data: roomEmails } = await supabase
      .from('room_emails')
      .select('rooms(name)')
      .eq('email_id', job.email_id)
      .limit(1)
    const first = roomEmails?.[0]
    roomName = (first?.rooms as { name: string } | null)?.name ?? null
  }

  return {
    id: job.id,
    description: job.description,
    status: job.status,
    intent: job.intent,
    owner: job.owner,
    due: job.due,
    roomName,
    timeline,
  }
}
