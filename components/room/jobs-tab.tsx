'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { JobRow } from '@/components/jobs/job-row'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import type { OpenLoops, OpenLoop } from '@/lib/jobs/open-loops'
import type { RoomJob } from '@/lib/blocks/types'

interface JobsTabProps {
  loops: OpenLoops
  connectedAddresses: string[]
  workspaceId: string
  roomId: string
  closedJobs?: RoomJob[]
}

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string): string {
  const parts = name.replace(/['"]/g, '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function JobsTab({
  loops,
  connectedAddresses,
  workspaceId: _workspaceId,
  roomId,
  closedJobs = [],
}: JobsTabProps) {
  const [closedExpanded, setClosedExpanded] = useState(true)
  const { openRespond } = useEmailSidePanel()

  const { yourCourt, theirCourt } = loops
  const connectedSet = new Set(connectedAddresses.map((a) => a.toLowerCase()))

  // ---------------------------------------------------------------------------
  // From others: yourCourt loops where sourceFromAddress is external (not self).
  // ---------------------------------------------------------------------------
  const fromOthersMap = new Map<string, OpenLoop[]>()
  const yourItems: OpenLoop[] = []

  for (const loop of yourCourt) {
    const srcAddr = loop.sourceFromAddress?.toLowerCase()
    if (!srcAddr || connectedSet.has(srcAddr)) {
      yourItems.push(loop)
      continue
    }
    const existing = fromOthersMap.get(srcAddr) ?? []
    existing.push(loop)
    fromOthersMap.set(srcAddr, existing)
  }

  // Sort groups: most silent first (max age_days in the group).
  const fromOthersGroups = [...fromOthersMap.entries()].sort(([, a], [, b]) => {
    const maxA = Math.max(...a.map((l) => l.age_days))
    const maxB = Math.max(...b.map((l) => l.age_days))
    return maxB - maxA
  })

  // Waiting on others: theirCourt sorted by age_days desc.
  const waitingOnOthers = [...theirCourt].sort((a, b) => b.age_days - a.age_days)

  // Your items sorted by updated_at desc.
  const yourItemsSorted = [...yourItems].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  // Chase count map for the "restated Nx" badge on all open loops.
  const allOpen = [...yourCourt, ...theirCourt]
  const chaseCountMap = new Map<string, number>()
  for (const loop of allOpen) {
    if (loop.parent_job_id) {
      chaseCountMap.set(loop.parent_job_id, (chaseCountMap.get(loop.parent_job_id) ?? 0) + 1)
    }
  }

  const now = new Date()

  return (
    <div className="space-y-8">
      {/* From others */}
      {fromOthersGroups.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              From others
            </p>
            <span className="text-[13px] text-muted-foreground">{fromOthersGroups.length}</span>
          </div>

          <div className="space-y-3">
            {fromOthersGroups.map(([srcAddr, groupLoops]) => {
              const displayName =
                groupLoops.find((l) => l.from_name)?.from_name ?? srcAddr
              const overdueCount = groupLoops.filter(
                (l) => !!l.due && new Date(l.due) < now,
              ).length

              return (
                <div
                  key={srcAddr}
                  className="rounded-xl border border-border bg-muted/10 overflow-hidden"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                        hashNeutral(srcAddr),
                      )}
                    >
                      {getInitials(displayName)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </p>
                      {displayName !== srcAddr && (
                        <p className="text-xs text-muted-foreground truncate">{srcAddr}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {groupLoops.length} {groupLoops.length === 1 ? 'item' : 'items'}
                      </span>
                      {overdueCount > 0 && (
                        <span className="text-xs font-medium text-red-400">
                          {overdueCount} overdue
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          openRespond({
                            personAddress: srcAddr,
                            personName: displayName !== srcAddr ? displayName : null,
                            roomId,
                          })
                        }
                        className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-80"
                      >
                        Respond
                      </button>
                    </div>
                  </div>

                  {/* Item rows */}
                  <div className="border-t border-border divide-y divide-border">
                    {groupLoops.map((loop) => {
                      const isOverdue = !!loop.due && new Date(loop.due) < now
                      const hasDue = !!loop.due && !isOverdue
                      const dotClass = isOverdue
                        ? 'bg-red-400'
                        : hasDue
                          ? 'bg-amber-400'
                          : 'bg-muted-foreground/40'
                      const sourceLabel = loop.from_name
                        ? loop.from_name.length > 30
                          ? loop.from_name.slice(0, 30) + '...'
                          : loop.from_name
                        : srcAddr.length > 30
                          ? srcAddr.slice(0, 30) + '...'
                          : srcAddr

                      return (
                        <div key={loop.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span
                            className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', dotClass)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-snug">
                              {loop.description}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {sourceLabel} &middot; {loop.age_days}d ago
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Your items */}
      {yourItemsSorted.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your items
            </p>
            <span className="text-[13px] text-muted-foreground">{yourItemsSorted.length}</span>
          </div>

          <div className="space-y-2">
            {yourItemsSorted.map((loop) => (
              <JobRow
                key={loop.id}
                job={{
                  id: loop.id,
                  description: loop.description,
                  owner: loop.owner ?? null,
                  due: loop.due ?? null,
                  emailId: loop.email_id,
                  status: loop.status,
                  isOverdue: !!loop.due && new Date(loop.due) < now,
                  updatedAt: loop.updated_at,
                  isYours: true,
                }}
                chaseCount={chaseCountMap.get(loop.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Waiting on others */}
      {waitingOnOthers.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Waiting on others
            </p>
            <span className="text-[13px] text-muted-foreground">{waitingOnOthers.length}</span>
          </div>

          <div className="space-y-2">
            {waitingOnOthers.map((loop) => (
              <JobRow
                key={loop.id}
                job={{
                  id: loop.id,
                  description: loop.description,
                  owner: loop.owner ?? null,
                  due: loop.due ?? null,
                  emailId: loop.email_id,
                  status: loop.status,
                  isOverdue: !!loop.due && new Date(loop.due) < now,
                  ageDays: loop.age_days,
                  updatedAt: loop.updated_at,
                  isYours: false,
                }}
                chaseCount={chaseCountMap.get(loop.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state when all sections are empty */}
      {fromOthersGroups.length === 0 && yourItemsSorted.length === 0 && waitingOnOthers.length === 0 && (
        <p className="text-sm text-muted-foreground">All jobs in this room are closed.</p>
      )}

      {/* Closed */}
      {closedJobs.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setClosedExpanded((v) => !v)}
            className="flex w-full items-center justify-between mb-4 text-left cursor-pointer"
          >
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Closed
            </p>
            <span className="text-[13px] text-muted-foreground">{closedJobs.length}</span>
          </button>

          {closedExpanded && (
            <div className="space-y-2">
              {closedJobs
                .slice()
                .sort((a, b) => {
                  if (!a.closed_at) return 1
                  if (!b.closed_at) return -1
                  return new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
                })
                .map((job) => (
                  <JobRow
                    key={job.id}
                    job={{
                      id: job.id,
                      description: job.description,
                      owner: job.owner,
                      due: job.due,
                      emailId: job.closed_by_email_id ?? job.email_id,
                      status: 'closed',
                      closedAt: job.closed_at,
                      closedByFromName: job.closed_by_from_name,
                    }}
                  />
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
