'use client'

import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'
import type { JobIntent } from '@/lib/types/database'
import type { OpenLoopsData } from '@/lib/blocks/open-loops'
import type { OwnerGroup, OpenLoop } from '@/lib/jobs/open-loops'

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
    CONFIRM: { label: 'CONFIRM', className: 'bg-muted text-foreground' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
    QUERY: { label: 'QUERY', className: 'bg-muted text-muted-foreground' },
  INTRODUCE: { label: 'INTRODUCE', className: 'bg-purple-500/10 text-purple-400' },
}

function getStatusDot(due: string | null): string {
  if (!due) return 'bg-muted-foreground'
  const d = new Date(due)
  const now = new Date()
  if (d < now) return 'bg-red-500'
  if (d < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-muted-foreground'
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function LoopRow({ loop, showOwner }: { loop: OpenLoop; showOwner: boolean }) {
  const intent = intentConfig[loop.intent as JobIntent]
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getStatusDot(loop.due))} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-2 mb-0.5">
          <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[13px] font-semibold tracking-wide', intent.className)}>
            {intent.label}
          </span>
          <span className="text-sm font-medium text-foreground leading-snug">{loop.description}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {[
            showOwner ? loop.owner : null,
            loop.due ? formatDue(loop.due) : null,
            formatAge(loop.age_days),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

// Flat fallback: renders theirCourt as a plain list with the owner address inline.
// Used by the realtime client path where person grouping is not available.
function AwaitingOthersFlat({ loops }: { loops: OpenLoop[] }) {
  return (
          <div className="divide-y divide-border">
            {loops.map((loop) => (
              <LoopRow key={loop.id} loop={loop} showOwner />
      ))}
    </div>
  )
}

// Grouped render: one section per person, headed by their canonical name or address.
// Used on SSR where groupTheirCourtByPerson has resolved identities.
function AwaitingOthersGrouped({ groups }: { groups: OwnerGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const heading =
          group.personKey === '__unassigned__'
            ? 'Unassigned'
            : (group.name ?? group.displayAddress ?? group.personKey)
        return (
          <div key={group.personKey}>
            <p className="text-[13px] font-medium text-muted-foreground mb-1 truncate">{heading}</p>
            <div className="divide-y divide-border">
              {group.loops.map((loop) => (
                <LoopRow key={loop.id} loop={loop} showOwner={false} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface OpenLoopsBlockProps {
  data: OpenLoopsData
}

export function OpenLoopsBlock({ data }: OpenLoopsBlockProps) {
  const { open } = useJobModal()

  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Open loops</p>
        <p className="text-sm text-muted-foreground">No open loops in this room.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Open loops</p>

      {data.yourCourt.length > 0 && (
        <div className="mb-4">
          <p className="text-[13px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Your court</p>
          <div className="divide-y divide-border">
            {data.yourCourt.map((loop) => {
              const intent = intentConfig[loop.intent as JobIntent]
              return (
                <button
                  key={loop.id}
                  onClick={() => open(loop.id)}
                  className="flex w-full items-start gap-3 py-3 first:pt-0 text-left hover:opacity-80 transition-opacity"
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getStatusDot(loop.due))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2 mb-0.5">
                      <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[13px] font-semibold tracking-wide', intent.className)}>
                        {intent.label}
                      </span>
                      <span className="text-sm font-medium text-foreground leading-snug">{loop.description}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[loop.due ? formatDue(loop.due) : null, formatAge(loop.age_days)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {data.theirCourt.length > 0 && (
        <div className={cn(data.yourCourt.length > 0 && 'border-t border-border pt-4')}>
          <p className="text-[13px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Awaiting others</p>
          {data.theirCourtByPerson && data.theirCourtByPerson.length > 0 ? (
            <AwaitingOthersGrouped groups={data.theirCourtByPerson} />
          ) : (
            <AwaitingOthersFlat loops={data.theirCourt} />
          )}
        </div>
      )}
    </div>
  )
}
