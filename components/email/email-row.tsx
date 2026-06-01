'use client'

import { useRouter } from 'next/navigation'
import { CornerDownLeft, CornerUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { warmPanelCache } from '@/lib/email/panel-cache'
import type { AllEmailsRow } from '@/lib/queries/all-emails'

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface EmailRowProps {
  email: AllEmailsRow
}

export function EmailRow({ email }: EmailRowProps) {
  const router = useRouter()

  const displayName = email.fromName || email.fromAddress
  const displaySubject =
    email.processingState === 'processed' && email.subjectSummary
      ? email.subjectSummary
      : email.subject

  const showUrgency = (email.urgencyScore ?? 0) >= 7
  const showJobs = email.jobCount > 0

  const emailPanelHref = email.roomId
    ? `/rooms/${email.roomId}?email=${email.id}&panel_tab=email`
    : null

  function handleMouseEnter() {
    if (!emailPanelHref) return
    warmPanelCache(email.id)
    router.prefetch(emailPanelHref)
  }

  return (
    <div
      onClick={emailPanelHref ? () => router.push(emailPanelHref) : undefined}
      onMouseEnter={emailPanelHref ? handleMouseEnter : undefined}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 group',
        emailPanelHref && 'cursor-pointer hover:bg-accent/50 transition-colors'
      )}
    >
      {/* Direction icon */}
      <span className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors">
        {email.source === 'user_sent'
          ? <CornerUpRight className="h-3.5 w-3.5" />
          : <CornerDownLeft className="h-3.5 w-3.5" />
        }
      </span>

      {/* Sender — fixed width so subjects always start at the same position */}
      <span className="shrink-0 w-36 text-sm font-medium text-foreground truncate">
        {displayName}
      </span>

      {/* Subject — fills remaining space */}
      <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
        {displaySubject ?? '(no subject)'}
      </span>

      {/* Right side metadata */}
      <div className="shrink-0 flex items-center gap-2">
        {showUrgency && (
          <span className="text-[11px] rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 font-medium leading-none">
            Urgent
          </span>
        )}
        {showJobs && (
          <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 leading-none">
            {email.jobCount === 1 ? '1 job' : `${email.jobCount} jobs`}
          </span>
        )}
        {email.roomId && email.roomName && (
          <a
            href={`/rooms/${email.roomId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 leading-none hover:bg-border transition-colors max-w-[128px] truncate"
          >
            {email.roomName}
          </a>
        )}
        <span className="text-xs text-muted-foreground/60 w-12 text-right tabular-nums shrink-0">
          {formatRelative(email.receivedAt)}
        </span>
      </div>
    </div>
  )
}
