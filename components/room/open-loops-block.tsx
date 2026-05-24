'use client'

import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'
import type { JobIntent } from '@/lib/types/database'
import type { OpenLoopsData } from '@/lib/blocks/open-loops'

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
  CONFIRM: { label: 'CONFIRM', className: 'bg-neutral-500/10 text-neutral-300' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
  QUERY: { label: 'QUERY', className: 'bg-neutral-500/10 text-neutral-400' },
  INTRODUCE: { label: 'INTRODUCE', className: 'bg-purple-500/10 text-purple-400' },
}

function getStatusDot(due: string | null): string {
  if (!due) return 'bg-neutral-600'
  const d = new Date(due)
  const now = new Date()
  if (d < now) return 'bg-red-500'
  if (d < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-neutral-500'
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

interface OpenLoopsBlockProps {
  data: OpenLoopsData
}

export function OpenLoopsBlock({ data }: OpenLoopsBlockProps) {
  const { open } = useJobModal()

  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Open loops</p>
        <p className="text-sm text-neutral-600">No open loops in this room.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">Open loops</p>

      {data.yourCourt.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-2">Your court</p>
          <div className="divide-y divide-neutral-800">
            {data.yourCourt.map((loop) => {
              const intent = intentConfig[loop.intent as JobIntent]
              return (
                <button
                  key={loop.id}
                  onClick={() => open(loop)}
                  className="flex w-full items-start gap-3 py-3 first:pt-0 text-left hover:opacity-80 transition-opacity"
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getStatusDot(loop.due))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2 mb-0.5">
                      <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide', intent.className)}>
                        {intent.label}
                      </span>
                      <span className="text-sm font-medium text-neutral-100 leading-snug">{loop.description}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
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
        <div className={cn(data.yourCourt.length > 0 && 'border-t border-neutral-800 pt-4')}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-2">Awaiting others</p>
          <div className="divide-y divide-neutral-800">
            {data.theirCourt.map((loop) => {
              const intent = intentConfig[loop.intent as JobIntent]
              return (
                <div
                  key={loop.id}
                  className="flex items-start gap-3 py-3 first:pt-0"
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getStatusDot(loop.due))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2 mb-0.5">
                      <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide', intent.className)}>
                        {intent.label}
                      </span>
                      <span className="text-sm font-medium text-neutral-100 leading-snug">{loop.description}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {[loop.owner, loop.due ? formatDue(loop.due) : null, formatAge(loop.age_days)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
