import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { getNotifications, markAllRead, type NotificationRow } from '@/lib/queries/notifications'
import { CheckCheck, Mail, Briefcase, RefreshCw, X } from 'lucide-react'

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function groupByDay(notifications: NotificationRow[]): Map<string, NotificationRow[]> {
  const groups = new Map<string, NotificationRow[]>()
  for (const n of notifications) {
    const key = new Date(n.created_at).toDateString()
    const group = groups.get(key) ?? []
    group.push(n)
    groups.set(key, group)
  }
  return groups
}

function NotificationIcon({ type }: { type: NotificationRow['type'] }) {
  const cls = 'h-4 w-4 shrink-0'
  switch (type) {
    case 'job_closed':
      return <CheckCheck className={cls} />
    case 'job_updated':
      return <RefreshCw className={cls} />
    case 'job_created':
      return <Briefcase className={cls} />
    case 'email_received':
      return <Mail className={cls} />
    default:
      return <Mail className={cls} />
  }
}

function typeLabel(type: NotificationRow['type']): string {
  switch (type) {
    case 'job_closed': return 'Closed'
    case 'job_updated': return 'Updated'
    case 'job_created': return 'Job'
    case 'email_received': return 'Email'
  }
}

export default async function ActivityPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const notifications = await getNotifications(workspaceId)

  // Mark all read — fire-and-forget from the server, non-blocking.
  markAllRead(workspaceId).catch((err: unknown) =>
    console.error('ActivityPage: markAllRead failed:', err)
  )

  if (notifications.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-1">Activity</h1>
        <p className="text-sm text-muted-foreground">Nothing yet. Activity will appear here as emails are processed.</p>
      </div>
    )
  }

  const groups = groupByDay(notifications)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">Activity</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {notifications.length} {notifications.length === 1 ? 'event' : 'events'}
      </p>

      <div className="space-y-10">
        {[...groups.entries()].map(([dayKey, rows]) => (
          <section key={dayKey}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {formatDayLabel(rows[0].created_at)}
            </p>
            <div className="space-y-0">
              {rows.map((n) => {
                const href = n.room_id
                  ? `/rooms/${n.room_id}?tab=jobs${n.email_id ? `&email=${n.email_id}` : ''}`
                  : '/activity'
                return (
                  <Link
                    key={n.id}
                    href={href}
                    className="flex items-start gap-3 py-3 border-b border-border last:border-0 hover:bg-accent/40 -mx-4 px-4 transition-colors rounded-lg group"
                  >
                    <span className={`mt-0.5 ${n.read_at ? 'text-muted-foreground' : 'text-foreground'}`}>
                      <NotificationIcon type={n.type} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read_at ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {n.summary}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {n.room_name && (
                          <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                            {n.room_name}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {formatTimeAgo(n.created_at)}
                        </span>
                      </div>
                    </div>
                    {!n.read_at && (
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
