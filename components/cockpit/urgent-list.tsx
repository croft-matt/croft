import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Email } from '@/lib/types/database'

interface UrgentListProps {
  emails: Email[]
  roomNames: Record<string, string>
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
    const clean = name.replace(/['"]/g, '').trim()
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return clean.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  const diffHours = diffMinutes / 60
  if (diffMinutes < 2) return 'just now'
  if (diffMinutes < 60) return `${Math.floor(diffMinutes)}m ago`
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function urgencyDotClass(score: number): string {
  if (score >= 8) return 'bg-red-500'
  return 'bg-amber-500'
}

export function UrgentList({ emails, roomNames }: UrgentListProps) {
  if (emails.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-1">Nothing urgent right now.</p>
    )
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => {
        const initials = getInitials(email.from_name, email.from_address)
        const avatarBg = hashNeutral(email.from_address)
        const displayName = email.from_name?.replace(/['"]/g, '').trim() ?? email.from_address
        const score = email.urgency_score ?? 0
        const roomName = roomNames[email.id] ?? null

        return (
          <Link
            key={email.id}
            href={`/emails/${email.id}?from=cockpit`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white mt-0.5',
                avatarBg
              )}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              {email.subject_summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{email.subject_summary}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatTime(email.received_at)}
                {roomName && <span> · {roomName}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 mt-0.5">
              <span className="text-xs font-semibold text-foreground">{score}</span>
              <span className={cn('h-2 w-2 rounded-full', urgencyDotClass(score))} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
