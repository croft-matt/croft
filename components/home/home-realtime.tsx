'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Email, Job } from '@/lib/types/database'
import type {
  WaitingEmail,
  OverdueJob,
  HotEmail,
  WaitingOnOthersPerson,
  HomeCounts,
} from '@/lib/queries/home'
import { AttentionByRoom } from '@/components/home/attention-by-room'
import { WaitingOnOthers } from '@/components/home/waiting-on-others'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  danger,
  success,
}: {
  label: string
  value: number
  sub?: string
  danger?: boolean
  success?: boolean
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p
        className={cn(
          'text-2xl font-medium tabular-nums',
          danger ? 'text-red-400' : success ? 'text-green-400' : 'text-foreground'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface HomeRealtimeProps {
  workspaceId: string
  workspaceName: string
  initialWaiting: WaitingEmail[]
  initialOverdue: OverdueJob[]
  initialHot: HotEmail[]
  initialProcessing: number
  initialFailed: number
  initialWaitingOnOthers: WaitingOnOthersPerson[]
  initialCounts: HomeCounts
}

const PROCESSING_STATES = new Set(['received', 'urgency_scanned', 'queued', 'processing'])

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeRealtime({
  workspaceId,
  workspaceName,
  initialWaiting,
  initialOverdue,
  initialHot,
  initialProcessing,
  initialFailed,
  initialWaitingOnOthers,
  initialCounts,
}: HomeRealtimeProps) {
  const router = useRouter()
  const [waiting] = useState(initialWaiting)
  const [overdue] = useState(initialOverdue)
  const [processing, setProcessing] = useState(initialProcessing)
  const [failed, setFailed] = useState(initialFailed)
  const [waitingOnOthers] = useState(initialWaitingOnOthers)
  const [homeCounts] = useState(initialCounts)

  useEffect(() => {
    const supabase = createClient()

    const emailChannel = supabase
      .channel(`home:${workspaceId}:emails`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emails',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const email = payload.new as Email
          if (!email?.id) return

          // Processing counter
          if (
            payload.eventType === 'INSERT' &&
            PROCESSING_STATES.has(email.processing_state)
          ) {
            setProcessing((p) => p + 1)
          }
          if (payload.eventType === 'UPDATE') {
            const prev = payload.old as Partial<Email>
            const wasProcessing = prev.processing_state
              ? PROCESSING_STATES.has(prev.processing_state)
              : false
            if (wasProcessing && !PROCESSING_STATES.has(email.processing_state)) {
              setProcessing((p) => Math.max(0, p - 1))
            }
            if (
              email.processing_state === 'failed' &&
              prev.processing_state !== 'failed'
            ) {
              setFailed((f) => f + 1)
            }
          }

          // Refresh grouped view when a new requires-response email lands.
          if (
            email.requires_response &&
            email.processing_state === 'processed'
          ) {
            router.refresh()
          }
        }
      )
      .subscribe()

    const jobChannel = supabase
      .channel(`home:${workspaceId}:jobs`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const job = payload.new as Job
          if (job.status === 'closed') {
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(emailChannel)
      supabase.removeChannel(jobChannel)
    }
  }, [workspaceId, router])

  const allClear =
    waiting.length === 0 &&
    overdue.length === 0 &&
    waitingOnOthers.length === 0

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

      {/* Stats strip */}
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border px-2 py-1">
        <StatCard
          label="Needs your attention"
          value={homeCounts.attentionCount}
          sub={
            homeCounts.attentionCount > 0
              ? `${homeCounts.attentionCount} items`
              : 'All clear'
          }
          danger={homeCounts.attentionCount > 0}
        />
        <StatCard
          label="Waiting on others"
          value={homeCounts.waitingOnOthersCount}
          sub={
            waitingOnOthers.length > 0
              ? `${waitingOnOthers.length} ${waitingOnOthers.length === 1 ? 'person' : 'people'}`
              : undefined
          }
        />
        <StatCard label="Active rooms" value={homeCounts.activeRoomsCount} />
        <StatCard
          label="Closed this week"
          value={homeCounts.closedThisWeekCount}
          success={homeCounts.closedThisWeekCount > 0}
        />
      </div>

      {/* Content */}
      {allClear ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">You're all caught up.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nothing overdue, nothing pending.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-5 overflow-y-auto px-6 py-5">
          {/* Left: needs your attention */}
          <div className="flex-[3] min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Needs your attention
            </p>
            <AttentionByRoom waitingEmails={waiting} overdueJobs={overdue} />
          </div>

          {/* Right: waiting on others */}
          <div className="flex-[2] min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Waiting on others
            </p>
            <WaitingOnOthers persons={waitingOnOthers} />
          </div>
        </div>
      )}
    </div>
  )
}
