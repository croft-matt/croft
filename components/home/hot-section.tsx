import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { HotEmail } from '@/lib/queries/home'

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
    const parts = name.replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function formatAge(receivedAt: string): string {
  const ms = Date.now() - new Date(receivedAt).getTime()
  const mins = ms / (1000 * 60)
  const hours = mins / 60
  if (mins < 2) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface HotSectionProps {
  emails: HotEmail[]
}

export function HotSection({ emails }: HotSectionProps) {
  if (emails.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-foreground">High urgency</h2>
        <span className="text-xs text-muted-foreground">last 48h</span>
      </div>
      <div className="space-y-1.5">
        {emails.map((email) => {
          const initials = getInitials(email.fromName, email.fromAddress)
          const displayName = email.fromName?.replace(/['"]/g, '').trim() ?? email.fromAddress
          const isVeryHot = email.urgencyScore >= 9

          return (
            <Link
              key={email.id}
              href={`/emails/${email.id}?from=/`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                  hashNeutral(email.fromAddress)
                )}
              >
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {email.urgencyReason ?? email.subjectSummary ?? ''}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2.5">
                {email.roomName && (
                  <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[120px]">
                    {email.roomName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatAge(email.receivedAt)}
                </span>
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    isVeryHot ? 'bg-red-500' : 'bg-amber-500'
                  )}
                />
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
