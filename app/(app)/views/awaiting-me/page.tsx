import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { getConnectedAddresses } from '@/lib/jobs/open-loops'

interface AwaitingJob {
  id: string
  description: string
  due: string | null
  urgency_score: number | null
  email_id: string
  room_id: string
  room_name: string
}

export default async function AwaitingMePage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const supabase = await createClient()

  const connectedAddresses = await getConnectedAddresses(workspaceId)
  if (connectedAddresses.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Awaiting me</h1>
        <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>
      </div>
    )
  }

  // Fetch all open jobs owned by any of the connected addresses.
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, description, due, email_id, owner')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .in('owner', connectedAddresses)
    .order('created_at', { ascending: true })

  if (!jobs || jobs.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Awaiting me</h1>
        <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>
      </div>
    )
  }

  const emailIds = [...new Set(jobs.map((j) => j.email_id))]

  const [roomEmailsResult, emailsResult] = await Promise.all([
    supabase
      .from('room_emails')
      .select('email_id, room_id')
      .in('email_id', emailIds),
    supabase
      .from('emails')
      .select('id, urgency_score')
      .in('id', emailIds),
  ])

  const roomIds = [...new Set((roomEmailsResult.data ?? []).map((re) => re.room_id))]
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name')
    .in('id', roomIds)
    .is('archived_at', null)

  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const urgencyMap = new Map((emailsResult.data ?? []).map((e) => [e.id, e.urgency_score]))

  const emailToRooms = new Map<string, string[]>()
  for (const re of roomEmailsResult.data ?? []) {
    const list = emailToRooms.get(re.email_id) ?? []
    list.push(re.room_id)
    emailToRooms.set(re.email_id, list)
  }

  const rows: AwaitingJob[] = []
  for (const job of jobs) {
    const roomsForJob = emailToRooms.get(job.email_id) ?? []
    if (roomsForJob.length === 0) continue
    for (const roomId of roomsForJob) {
      const roomName = roomMap.get(roomId)
      if (!roomName) continue
      rows.push({
        id: job.id,
        description: job.description,
        due: job.due,
        urgency_score: urgencyMap.get(job.email_id) ?? null,
        email_id: job.email_id,
        room_id: roomId,
        room_name: roomName,
      })
    }
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Awaiting me</h1>
        <p className="text-sm text-muted-foreground">Nothing is waiting on you.</p>
      </div>
    )
  }

  // Group by room.
  const byRoom = new Map<string, AwaitingJob[]>()
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? []
    list.push(row)
    byRoom.set(row.room_id, list)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">Awaiting me</h1>
      <p className="text-sm text-muted-foreground mb-8">{rows.length} {rows.length === 1 ? 'item' : 'items'}</p>

      <div className="space-y-8">
        {[...byRoom.entries()].map(([roomId, roomJobs]) => (
          <div key={roomId}>
            <Link
              href={`/rooms/${roomId}`}
              className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              {roomJobs[0].room_name}
            </Link>
            <div className="mt-3 space-y-2">
              {roomJobs.map((job) => (
                <Link
                  key={`${job.id}-${roomId}`}
                  href={`/rooms/${roomId}?tab=jobs`}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <UrgencyDot score={job.urgency_score} />
                    <p className="text-sm text-foreground">{job.description}</p>
                  </div>
                  {job.due && (
                    <p className="shrink-0 text-xs text-muted-foreground">
                      Due {new Date(job.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UrgencyDot({ score }: { score: number | null }) {
  if (score === null) return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted" />
  if (score >= 7) return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
  if (score >= 4) return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
  return <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted" />
}
