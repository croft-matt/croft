import Link from 'next/link'
import { Loader2, Flag } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import type { Email } from '@/lib/types/database'

interface EmailsTabProps {
  emails: Email[]
  roomId: string
}

const PROCESSING_STATES = new Set(['received', 'urgency_scanned', 'queued', 'processing'])

export function EmailsTab({ emails, roomId }: EmailsTabProps) {
  if (emails.length === 0) {
    return <p className="text-sm text-neutral-600">No emails in this room yet.</p>
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => {
        const isProcessing = PROCESSING_STATES.has(email.processing_state)
        const isIncomplete = email.processing_state === 'processed' && email.extraction_complete === false
        const openJobCount = (email.extraction?.jobs ?? []).filter(
          (j: { confidence: number }) => j.confidence > 0
        ).length

        return (
          <Link
            key={email.id}
            href={`/emails/${email.id}?from=/rooms/${roomId}`}
            className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 hover:bg-neutral-800 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium text-neutral-100 truncate">
                  {email.from_name ?? email.from_address}
                </p>
                {isProcessing && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-600" />
                )}
                {isIncomplete && (
                  <Flag className="h-3.5 w-3.5 shrink-0 text-neutral-600" title="May have missed something" />
                )}
              </div>
              <p className="text-xs text-neutral-500 truncate">
                {email.subject_summary ?? email.subject ?? '(no subject)'}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-3 text-right">
              {openJobCount > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  {openJobCount} jobs
                </span>
              )}
              <p className="text-xs text-neutral-600 whitespace-nowrap">
                {formatRelativeTime(email.received_at)}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
