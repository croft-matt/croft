import Link from 'next/link'
import { Reply } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import type { Email, Job, Room } from '@/lib/types/database'

interface EmailHeaderProps {
  email: Email
  jobs: Job[]
  rooms: Pick<Room, 'id' | 'name'>[]
  onReply?: () => void
  repliedTo?: boolean
}

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.replace(/['"]/g, '').trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function EmailHeader({ email, jobs, rooms, onReply, repliedTo }: EmailHeaderProps) {
  const openJobCount = jobs.filter((j) => j.status === 'open').length
  const displayName = email.from_name?.replace(/['"]/g, '').trim() ?? email.from_address
  const timeStr = formatRelativeTime(email.received_at)

  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-4 justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white mt-0.5',
              hashNeutral(email.from_address)
            )}
          >
            {getInitials(email.from_name, email.from_address)}
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{email.from_address}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{timeStr}</p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {openJobCount > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
              {openJobCount} jobs
            </span>
          )}
          {rooms.slice(0, 4).map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="max-w-[9rem] truncate rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title={room.name}
            >
              {room.name}
            </Link>
          ))}
          {rooms.length > 4 && (
            <span className="text-xs text-muted-foreground">+{rooms.length - 4} more</span>
          )}
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-80"
            >
              <Reply className="h-3 w-3" />
              {repliedTo ? 'Reply again' : 'Reply'}
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
