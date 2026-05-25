'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'
import { EmailCitation } from '@/components/room/email-citation'
import type { JobIntent } from '@/lib/types/database'
import type { OpenLoops, OpenLoop, OwnerGroup } from '@/lib/jobs/open-loops'

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
  CONFIRM: { label: 'CONFIRM', className: 'bg-muted text-foreground' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
  QUERY: { label: 'QUERY', className: 'bg-muted text-muted-foreground' },
  INTRODUCE: { label: 'INTRODUCE', className: 'bg-purple-500/10 text-purple-400' },
}

function getStatusDot(due: string | null): string {
  if (!due) return 'bg-muted-foreground/40'
  const d = new Date(due)
  const now = new Date()
  if (d < now) return 'bg-red-500'
  if (d < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}

function formatDue(due: string): string {
  const d = new Date(due)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays > 0) return `${diffDays}d overdue`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Rank yourCourt: overdue oldest first, due-soon soonest first, no-due oldest first.
// Within each tier, higher chase count (loops pointing to this job as parent) ranks first.
function rankYourCourt(loops: OpenLoop[], chaseCountMap: Map<string, number>): OpenLoop[] {
  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  function tier(loop: OpenLoop): number {
    if (!loop.due) return 3
    const d = new Date(loop.due)
    if (d < now) return 1
    if (d < sevenDays) return 2
    return 3
  }

  return [...loops].sort((a, b) => {
    const ta = tier(a)
    const tb = tier(b)
    if (ta !== tb) return ta - tb

    const chaseA = chaseCountMap.get(a.id) ?? 0
    const chaseB = chaseCountMap.get(b.id) ?? 0
    if (chaseA !== chaseB) return chaseB - chaseA

    if (ta === 1) {
      // Overdue: oldest overdue first
      return new Date(a.due!).getTime() - new Date(b.due!).getTime()
    }
    if (ta === 2) {
      // Due soon: soonest first
      return new Date(a.due!).getTime() - new Date(b.due!).getTime()
    }
    // No due: oldest created_at first
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

// Build address -> personKey lookup from OwnerGroup[] for re-grouping live loops.
function buildAddressIndex(ownerGroups: OwnerGroup[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const group of ownerGroups) {
    // Each OwnerGroup has a personKey and a displayAddress. We need all addresses
    // for the group. The OwnerGroup type carries loops with owner addresses we can use.
    for (const loop of group.loops) {
      if (loop.owner) {
        index.set(loop.owner.toLowerCase(), group.personKey)
      }
    }
  }
  return index
}

// Group theirCourt loops by person using the ownerGroups identity data.
// When ownerGroups is empty, returns null (fall back to flat rendering).
function groupByPerson(
  theirCourt: OpenLoop[],
  ownerGroups: OwnerGroup[],
): OwnerGroup[] | null {
  if (ownerGroups.length === 0) return null

  const addressIndex = buildAddressIndex(ownerGroups)
  const personMeta = new Map<string, { name: string | null; displayAddress: string | null }>(
    ownerGroups.map((g) => [g.personKey, { name: g.name, displayAddress: g.displayAddress }]),
  )

  const groupMap = new Map<string, OpenLoop[]>()

  for (const loop of theirCourt) {
    if (loop.owner === null) {
      const existing = groupMap.get('__unassigned__') ?? []
      existing.push(loop)
      groupMap.set('__unassigned__', existing)
      continue
    }
    const personKey = addressIndex.get(loop.owner.toLowerCase()) ?? loop.owner.toLowerCase()
    const existing = groupMap.get(personKey) ?? []
    existing.push(loop)
    groupMap.set(personKey, existing)
  }

  const result: OwnerGroup[] = []

  for (const [personKey, loops] of groupMap) {
    if (personKey === '__unassigned__') continue
    const meta = personMeta.get(personKey)
    const sortedLoops = loops.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    result.push({
      personKey,
      name: meta?.name ?? null,
      displayAddress: meta?.displayAddress ?? loops[0]?.owner ?? null,
      loops: sortedLoops,
      oldestAge: Math.max(...sortedLoops.map((l) => l.age_days)),
    })
  }

  result.sort((a, b) => b.oldestAge - a.oldestAge)

  const unassigned = groupMap.get('__unassigned__')
  if (unassigned) {
    const sortedLoops = unassigned.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    result.push({
      personKey: '__unassigned__',
      name: null,
      displayAddress: null,
      loops: sortedLoops,
      oldestAge: Math.max(...sortedLoops.map((l) => l.age_days)),
    })
  }

  return result.length > 0 ? result : null
}

interface JobsTabProps {
  loops: OpenLoops
  ownerGroups: OwnerGroup[]
  workspaceId: string
}

export function JobsTab({ loops, ownerGroups }: JobsTabProps) {
  const { open: openModal } = useJobModal()
  const [othersExpanded, setOthersExpanded] = useState(false)

  const { yourCourt, theirCourt } = loops
  const totalOpen = yourCourt.length + theirCourt.length

  // Derive chase counts from parent_job_id relationships within yourCourt.
  const chaseCountMap = new Map<string, number>()
  for (const loop of yourCourt) {
    if (loop.parent_job_id) {
      chaseCountMap.set(loop.parent_job_id, (chaseCountMap.get(loop.parent_job_id) ?? 0) + 1)
    }
  }

  const rankedYourCourt = rankYourCourt(yourCourt, chaseCountMap)
  const personGroups = groupByPerson(theirCourt, ownerGroups)

  return (
    <div className="space-y-8">
      {/* Awaiting you */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Awaiting you
          </p>
          <span className="text-[11px] text-muted-foreground">{yourCourt.length}</span>
        </div>

        {yourCourt.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {totalOpen === 0
              ? 'All jobs in this room are closed.'
              : 'Nothing is waiting on you here.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rankedYourCourt.map((loop) => {
              const intent = intentConfig[loop.intent as JobIntent]
              const chaseCount = chaseCountMap.get(loop.id) ?? 0

              return (
                <button
                  key={loop.id}
                  type="button"
                  onClick={() => openModal(loop)}
                  className="flex w-full items-start gap-3 py-3 first:pt-0 text-left hover:opacity-80 transition-opacity"
                >
                  <span
                    className={cn(
                      'mt-[5px] h-2 w-2 shrink-0 rounded-full',
                      getStatusDot(loop.due),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2 mb-1">
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
                          intent.className,
                        )}
                      >
                        {intent.label}
                      </span>
                      <span className="text-sm font-medium text-foreground leading-snug">
                        {loop.description}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        loop.from_name,
                        loop.due ? formatDue(loop.due) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {chaseCount > 0 && (
                        <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          restated {chaseCount}x
                        </span>
                      )}
                    </p>
                  </div>
                  <EmailCitation emailId={loop.email_id} />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Awaiting others */}
      {theirCourt.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setOthersExpanded((v) => !v)}
            className="flex w-full items-center justify-between mb-4 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting others
            </p>
            <span className="text-[11px] text-muted-foreground">{theirCourt.length}</span>
          </button>

          {othersExpanded && (
            personGroups ? (
              <div className="space-y-6">
                {personGroups.map((group) => {
                  const heading =
                    group.personKey === '__unassigned__'
                      ? 'Unassigned'
                      : (group.name ?? group.displayAddress ?? group.personKey)

                  return (
                    <div key={group.personKey}>
                      <p className="text-[11px] font-medium text-muted-foreground mb-2 truncate">
                        {heading}
                        <span className="ml-1.5 opacity-60">{group.loops.length}</span>
                      </p>
                      <div className="divide-y divide-border">
                        {group.loops.map((loop) => (
                          <div key={loop.id} className="flex items-start gap-3 py-3 first:pt-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground leading-snug mb-0.5">
                                {loop.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                silent {loop.age_days} {loop.age_days === 1 ? 'day' : 'days'}
                              </p>
                            </div>
                            <EmailCitation emailId={loop.email_id} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              // Flat fallback: person grouping not yet available (before Commit 3 threads ownerGroups).
              <div className="space-y-2">
                {theirCourt
                  .slice()
                  .sort((a, b) => {
                    if (a.owner === null && b.owner !== null) return 1
                    if (a.owner !== null && b.owner === null) return -1
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  })
                  .map((loop) => (
                    <div key={loop.id} className="flex items-start gap-3 py-3 first:pt-0 border-b border-border last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground leading-snug mb-0.5">
                          {loop.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            loop.owner ?? 'Unassigned',
                            `silent ${loop.age_days} ${loop.age_days === 1 ? 'day' : 'days'}`,
                          ].join(' · ')}
                        </p>
                      </div>
                      <EmailCitation emailId={loop.email_id} />
                    </div>
                  ))}
              </div>
            )
          )}
        </section>
      )}
    </div>
  )
}
