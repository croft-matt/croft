import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { getNotifications, type NotificationRow } from '@/lib/queries/notifications'
import { NotificationItem } from '@/components/notifications/notification-item'

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

export default async function ActivityPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const notifications = await getNotifications(workspaceId)

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
            <div className="space-y-2">
              {rows.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
