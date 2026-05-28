'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Mail, Briefcase, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { markNotificationRead } from '@/lib/notifications/actions'
import type { NotificationRow } from '@/lib/queries/notifications'

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

function NotificationIcon({ type }: { type: NotificationRow['type'] }) {
  const cls = 'h-3.5 w-3.5 shrink-0'
  switch (type) {
    case 'job_closed': return <CheckCheck className={cls} />
    case 'job_updated': return <RefreshCw className={cls} />
    case 'job_created': return <Briefcase className={cls} />
    case 'email_received': return <Mail className={cls} />
    default: return <Mail className={cls} />
  }
}

interface NotificationItemProps {
  notification: NotificationRow
}

export function NotificationItem({ notification: n }: NotificationItemProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [read, setRead] = useState(n.read_at !== null)

  const isEmailNotification = n.type === 'email_received'
  const panelTab = isEmailNotification ? 'email' : 'jobs'
  const href = n.room_id
    ? `/rooms/${n.room_id}?tab=jobs${n.email_id ? `&email=${n.email_id}&panel_tab=${panelTab}` : ''}`
    : '/activity'

  function handleClick() {
    if (!read) {
      setRead(true)
      startTransition(() => {
        markNotificationRead(n.id)
      })
    }
    router.push(href)
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'rounded-xl border bg-card px-4 py-3 space-y-1 cursor-pointer transition-colors hover:bg-accent/40',
        read ? 'border-border' : 'border-border'
      )}
    >
      {/* Line 1: icon + summary + time + unread dot */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('shrink-0', read ? 'text-muted-foreground' : 'text-foreground')}>
            <NotificationIcon type={n.type} />
          </span>
          <span className={cn('text-sm font-medium truncate', read ? 'text-muted-foreground' : 'text-foreground')}>
            {n.summary}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{formatTimeAgo(n.created_at)}</span>
          {!read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
        </div>
      </div>

      {/* Line 2: room pill */}
      {n.room_name && (
        <div className="flex items-center gap-2 pl-5">
          <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
            {n.room_name}
          </span>
        </div>
      )}
    </div>
  )
}
