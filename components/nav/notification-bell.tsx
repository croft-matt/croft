'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface NotificationBellProps {
  workspaceId: string
  initialCount: number
}

export function NotificationBell({ workspaceId, initialCount }: NotificationBellProps) {
  const pathname = usePathname()
  const [count, setCount] = useState(initialCount)
  const isActive = pathname === '/activity'

  // Subscribe to notification inserts (increment) and updates (decrement when read).
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`notifications:${workspaceId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          setCount((c) => c + 1)
        }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: { new: { read_at: string | null } }) => {
          // Decrement only when a notification transitions to read.
          if (payload.new.read_at !== null) {
            setCount((c) => Math.max(0, c - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  return (
    <Link
      href="/activity"
      className={cn(
        'relative flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      )}
      style={{ color: isActive ? undefined : 'var(--sidebar-muted-foreground)' }}
    >
      <Bell className="h-3.5 w-3.5 shrink-0" />
      Activity
      {count > 0 && (
        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
