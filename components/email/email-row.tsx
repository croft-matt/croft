'use client'

import { useRouter } from 'next/navigation'
import { CornerDownLeft, CornerUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AllEmailsRow } from '@/lib/queries/all-emails'

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
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
  const showBadges = showUrgency || showJobs

  // Link to the room with this email open in the side panel.
  const emailPanelHref = email.roomId
    ? `/rooms/${email.roomId}?email=${email.id}&panel_tab=email`
    : null

  return (
    <div
      onClick={emailPanelHref ? () => router.push(emailPanelHref) : undefined}
      className={cn(
        'rounded-xl border border-border bg-card px-4 py-3 space-y-1',
        emailPanelHref && 'cursor-pointer hover:bg-accent/40 transition-colors'
      )}
    >
      {/* Line 1: direction icon + sender + time */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {email.source === 'user_sent'
            ? <CornerUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            : <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />
          }
          <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatRelative(email.receivedAt)}
        </span>
      </div>

      {/* Line 2: subject + room pill */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground truncate">{displaySubject}</span>
        {email.roomId && email.roomName && (
          <a
            href={`/rooms/${email.roomId}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 hover:bg-muted/80 transition-colors"
          >
            {email.roomName}
          </a>
        )}
      </div>

      {/* Line 3: badges — only rendered when at least one applies */}
      {showBadges && (
        <div className="flex items-center gap-1.5 pt-0.5">
          {showUrgency && (
            <span className="text-[11px] rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 font-medium">
              Urgent
            </span>
          )}
          {showJobs && (
            <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {email.jobCount === 1 ? '1 job' : `${email.jobCount} jobs`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
