'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email, Job } from '@/lib/types/database'
import type { WaitingEmail, OverdueJob, HotEmail } from '@/lib/queries/home'
import { WaitingSection } from '@/components/home/waiting-section'
import { OverdueSection } from '@/components/home/overdue-section'
import { HotSection } from '@/components/home/hot-section'

interface HomeRealtimeProps {
  workspaceId: string
  workspaceName: string
  initialWaiting: WaitingEmail[]
  initialOverdue: OverdueJob[]
  initialHot: HotEmail[]
  initialProcessing: number
  initialFailed: number
}

const PROCESSING_STATES = new Set(['received', 'urgency_scanned', 'queued', 'processing'])

export function HomeRealtime({
  workspaceId,
  workspaceName,
  initialWaiting,
  initialOverdue,
  initialHot,
  initialProcessing,
  initialFailed,
}: HomeRealtimeProps) {
  const [waiting, setWaiting] = useState(initialWaiting)
  const [overdue, setOverdue] = useState(initialOverdue)
  const [hot, setHot] = useState(initialHot)
  const [processing, setProcessing] = useState(initialProcessing)
  const [failed, setFailed] = useState(initialFailed)

  useEffect(() => {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const emailChannel = supabase
      .channel(`home:${workspaceId}:emails`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emails', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const email = payload.new as Email
          if (!email?.id) return

          // Processing counter
          if (payload.eventType === 'INSERT' && PROCESSING_STATES.has(email.processing_state)) {
            setProcessing((p) => p + 1)
          }
          if (payload.eventType === 'UPDATE') {
            const prev = payload.old as Partial<Email>
            const wasProcessing = prev.processing_state ? PROCESSING_STATES.has(prev.processing_state) : false
            if (wasProcessing && !PROCESSING_STATES.has(email.processing_state)) {
              setProcessing((p) => Math.max(0, p - 1))
            }
            if (email.processing_state === 'failed' && prev.processing_state !== 'failed') {
              setFailed((f) => f + 1)
            }
          }

          // Hot emails: prepend if newly scored high
          if (
            (email.urgency_score ?? 0) >= 7 &&
            email.processing_state === 'processed' &&
            email.received_at >= cutoff
          ) {
            setHot((prev) => {
              const exists = prev.some((e) => e.id === email.id)
              const entry: HotEmail = {
                id: email.id,
                fromName: email.from_name,
                fromAddress: email.from_address,
                urgencyScore: email.urgency_score ?? 7,
                urgencyReason: (email as unknown as { urgency_reason?: string }).urgency_reason ?? null,
                subjectSummary: email.subject_summary ?? null,
                receivedAt: email.received_at,
                roomId: null,
                roomName: null,
              }
              if (exists) return prev.map((e) => (e.id === email.id ? { ...e, ...entry } : e))
              return [entry, ...prev].slice(0, 20)
            })
          }

          // Waiting: add if requires_response flipped to true
          if (email.requires_response && email.processing_state === 'processed') {
            setWaiting((prev) => {
              if (prev.some((e) => e.id === email.id)) return prev
              const entry: WaitingEmail = {
                id: email.id,
                fromName: email.from_name,
                fromAddress: email.from_address,
                subjectSummary: email.subject_summary ?? null,
                receivedAt: email.received_at,
                responseBy: (email as unknown as { response_by?: string }).response_by ?? null,
                roomId: null,
                roomName: null,
              }
              return [entry, ...prev]
            })
          }
        }
      )
      .subscribe()

    const jobChannel = supabase
      .channel(`home:${workspaceId}:jobs`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const job = payload.new as Job
          if (job.status === 'closed') {
            setOverdue((prev) => prev.filter((j) => j.id !== job.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(emailChannel)
      supabase.removeChannel(jobChannel)
    }
  }, [workspaceId])

  const allClear = waiting.length === 0 && overdue.length === 0 && hot.length === 0

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {workspaceName}
        </p>
        <div className="flex-1 flex justify-center">
          {failed > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Some emails failed to process.
            </span>
          )}
          {failed === 0 && processing > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              Processing {processing} {processing === 1 ? 'email' : 'emails'}
            </span>
          )}
        </div>
        <div className="w-[80px]" />
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-6 max-w-2xl space-y-8">
        {allClear ? (
          <div className="pt-16 text-center">
            <p className="text-sm font-medium text-foreground">You're all caught up.</p>
            <p className="text-xs text-muted-foreground mt-1">Nothing urgent, no overdue jobs.</p>
          </div>
        ) : (
          <>
            <WaitingSection emails={waiting} />
            <OverdueSection jobs={overdue} />
            <HotSection emails={hot} />
          </>
        )}
      </div>
    </div>
  )
}
