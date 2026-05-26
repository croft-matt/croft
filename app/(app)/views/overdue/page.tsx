import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

interface OverdueJob {
  id: string
  description: string
  due: string
  email_id: string
  room_id: string
  room_name: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysOverdue(iso: string): number {
  const due = new Date(iso)
  const now = new Date()
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function OverduePage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const supabase = await createClient()
  const now = new Date().toISOString()

  // Fetch overdue open jobs with their source email room associations.
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, description, due, email_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .not('due', 'is', null)
    .lt('due', now)
    .order('due', { ascending: true })

  if (!jobs || jobs.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Overdue</h1>
        <p className="text-sm text-muted-foreground">Nothing is overdue.</p>
      </div>
    )
  }

  // Get room associations for these emails.
  const emailIds = [...new Set(jobs.map((j) => j.email_id))]

  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id')
    .in('email_id', emailIds)

  const roomIds = [...new Set((roomEmails ?? []).map((re) => re.room_id))]

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name')
    .in('id', roomIds)
    .is('archived_at', null)

  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
  const emailToRooms = new Map<string, string[]>()
  for (const re of roomEmails ?? []) {
    const list = emailToRooms.get(re.email_id) ?? []
    list.push(re.room_id)
    emailToRooms.set(re.email_id, list)
  }

  // Build a flat list of job + room pairs (one row per room an overdue job appears in).
  const rows: OverdueJob[] = []
  for (const job of jobs) {
    const roomsForJob = emailToRooms.get(job.email_id) ?? []
    if (roomsForJob.length === 0) continue
    for (const roomId of roomsForJob) {
      const roomName = roomMap.get(roomId)
      if (!roomName) continue
      rows.push({
        id: job.id,
        description: job.description,
        due: job.due!,
        email_id: job.email_id,
        room_id: roomId,
        room_name: roomName,
      })
    }
  }

  // Group by room.
  const byRoom = new Map<string, OverdueJob[]>()
  for (const row of rows) {
    const list = byRoom.get(row.room_id) ?? []
    list.push(row)
    byRoom.set(row.room_id, list)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">Overdue</h1>
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
              {roomJobs.map((job) => {
                const overdue = daysOverdue(job.due)
                return (
                  <Link key={`${job.id}-${roomId}`} href={`/rooms/${roomId}?tab=jobs`} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors">
                    <p className="text-sm text-foreground">{job.description}</p>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">{formatDate(job.due)}</p>
                      <p className="text-xs text-red-400 mt-0.5">
                        {overdue === 1 ? '1 day overdue' : `${overdue} days overdue`}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
