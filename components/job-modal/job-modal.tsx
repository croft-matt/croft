'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Mail, RotateCcw, CheckCheck, RefreshCw, AlertCircle } from 'lucide-react'
import { useJobModal } from '@/stores/job-modal-store'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import type { JobActivityData, JobActivityEvent } from '@/lib/queries/job-activity'

const INTENT_LABEL: Record<string, string> = {
  REQUEST: 'Request',
  DELIVER: 'Deliver',
  CONFIRM: 'Confirm',
  CHASE: 'Chase',
  QUERY: 'Query',
  INTRODUCE: 'Introduce',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EventIcon({ type }: { type: JobActivityEvent['type'] }) {
  const cls = 'h-3.5 w-3.5'
  switch (type) {
    case 'created': return <Mail className={cls} />
    case 'chased': return <AlertCircle className={cls} />
    case 'updated': return <RefreshCw className={cls} />
    case 'closed': return <CheckCheck className={cls} />
  }
}

function eventLabel(type: JobActivityEvent['type']): string {
  switch (type) {
    case 'created': return 'Created'
    case 'chased': return 'Chased'
    case 'updated': return 'Updated'
    case 'closed': return 'Resolved'
  }
}

interface TimelineEventProps {
  event: JobActivityEvent
  onOpenEmail: (emailId: string) => void
  isLast: boolean
}

function TimelineEvent({ event, onOpenEmail, isLast }: TimelineEventProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <EventIcon type={event.type} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
      </div>
      <div className="pb-5 min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eventLabel(event.type)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatDate(event.receivedAt)} · {formatTime(event.receivedAt)}
          </span>
        </div>
        <p className="text-sm text-foreground leading-snug mb-1">
          {event.subjectSummary ?? 'Email'}
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          {event.fromName ?? event.fromAddress}
        </p>
        <button
          onClick={() => onOpenEmail(event.emailId)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Mail className="h-3 w-3" />
          View email
        </button>
      </div>
    </div>
  )
}

async function reopenJob(jobId: string): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/reopen`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reopen job')
}

export function JobModal() {
  const { jobId, close } = useJobModal()
  const { open: openEmail } = useEmailSidePanel()
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<JobActivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [reopening, setReopening] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!jobId) {
      setData(null)
      return
    }
    setLoading(true)
    fetch(`/api/jobs/${jobId}/activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JobActivityData | null) => setData(d))
      .finally(() => setLoading(false))
  }, [jobId])

  function handleOpenEmail(emailId: string) {
    openEmail(emailId)
    close()
  }

  async function handleReopen() {
    if (!jobId) return
    setReopening(true)
    try {
      await reopenJob(jobId)
      close()
    } catch {
      // silent
    } finally {
      setReopening(false)
    }
  }

  if (!mounted || !jobId) return null

  const isClosed = data?.status === 'closed'
  const sourceEmailId = data?.timeline.find((e) => e.type === 'created')?.emailId ?? null

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[520px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
          <div className="min-w-0 flex-1">
            {data && (
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">
                  {INTENT_LABEL[data.intent] ?? data.intent}
                </span>
                {data.roomName && (
                  <span className="text-[11px] text-muted-foreground">{data.roomName}</span>
                )}
                {isClosed && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                    Closed
                  </span>
                )}
              </div>
            )}
            <p className="text-sm font-medium text-foreground leading-snug">
              {loading ? 'Loading…' : (data?.description ?? '—')}
            </p>
            {data?.owner && (
              <p className="mt-1 text-xs text-muted-foreground">{data.owner}</p>
            )}
          </div>
          <button
            onClick={close}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="px-5 py-5 overflow-y-auto max-h-[55vh]">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading activity…</p>
          )}
          {!loading && data && data.timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">No email activity found for this job.</p>
          )}
          {!loading && data && data.timeline.length > 0 && (
            <div>
              {data.timeline.map((event, i) => (
                <TimelineEvent
                  key={event.emailId + event.type}
                  event={event}
                  onOpenEmail={handleOpenEmail}
                  isLast={i === data.timeline.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border">
            <div className="flex items-center gap-2">
              {isClosed ? (
                <button
                  onClick={handleReopen}
                  disabled={reopening}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {reopening ? 'Reopening…' : 'Reopen'}
                </button>
              ) : sourceEmailId ? (
                <button
                  onClick={() => handleOpenEmail(sourceEmailId)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Go to email
                </button>
              ) : null}
            </div>
            <button
              onClick={close}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
