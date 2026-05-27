'use client'

import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CheckCheck, Mail, Briefcase, RefreshCw } from 'lucide-react'

interface NotificationToasterProps {
  workspaceId: string
}

type NotificationType = 'job_created' | 'job_updated' | 'job_closed' | 'email_received'

interface NotificationPayload {
  id: string
  type: NotificationType
  summary: string
  room_id: string | null
  email_id: string | null
  job_id: string | null
  created_at: string
}

function toastIcon(type: NotificationType) {
  const cls = 'h-4 w-4 shrink-0 mt-0.5'
  switch (type) {
    case 'job_closed': return <CheckCheck className={cls} />
    case 'job_updated': return <RefreshCw className={cls} />
    case 'job_created': return <Briefcase className={cls} />
    case 'email_received': return <Mail className={cls} />
  }
}

function showNotificationToast(n: NotificationPayload) {
  const href = n.room_id ? `/rooms/${n.room_id}?tab=jobs` : '/activity'

  toast.custom(
    (t) => (
      <div
        className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm cursor-pointer w-[360px]"
        onClick={() => {
          window.location.href = href
          toast.dismiss(t)
        }}
      >
        <span className="text-muted-foreground">{toastIcon(n.type)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">{n.summary}</p>
        </div>
      </div>
    ),
    { duration: 6000 }
  )
}

export function NotificationToaster({ workspaceId }: NotificationToasterProps) {
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`notifications-toast:${workspaceId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: { new: NotificationPayload }) => {
          showNotificationToast(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  return (
    <Toaster
      position="bottom-right"
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'w-full',
        },
      }}
    />
  )
}
