'use client'

import { useState } from 'react'
import { EmailCitation } from '@/components/room/email-citation'
import { JobRow } from '@/components/jobs/job-row'
import type { OpenLoops, OpenLoop, OwnerGroup } from '@/lib/jobs/open-loops'

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
  const [youExpanded, setYouExpanded] = useState(true)
  const [othersExpanded, setOthersExpanded] = useState(false)

  const { yourCourt, theirCourt } = loops
  const totalOpen = yourCourt.length + theirCourt.length

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
        <button
          type="button"
          onClick={() => setYouExpanded((v) => !v)}
          className="flex w-full items-center justify-between mb-4 text-left cursor-pointer"
        >
          <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Awaiting you
          </p>
          <span className="text-[13px] text-muted-foreground">{yourCourt.length}</span>
        </button>

        {youExpanded && (yourCourt.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {totalOpen === 0
              ? 'All jobs in this room are closed.'
              : 'Nothing is waiting on you here.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rankedYourCourt.map((loop) => {
              const now = new Date()
              return (
                <JobRow
                  key={loop.id}
                  job={{
                    id: loop.id,
                    description: loop.description,
                    owner: loop.from_name ?? loop.owner ?? null,
                    due: loop.due ?? null,
                    emailId: loop.email_id,
                    status: loop.status,
                    isOverdue: !!loop.due && new Date(loop.due) < now,
                  }}
                  chaseCount={chaseCountMap.get(loop.id)}
                />
              )
            })}
          </div>
        ))}
      </section>

      {/* Awaiting others */}
      {theirCourt.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setOthersExpanded((v) => !v)}
            className="flex w-full items-center justify-between mb-4 text-left"
          >
            <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Awaiting others
            </p>
            <span className="text-[13px] text-muted-foreground">{theirCourt.length}</span>
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
                      <p className="text-[13px] font-medium text-muted-foreground mb-2 truncate">
                        {heading}
                        <span className="ml-1.5 opacity-60">{group.loops.length}</span>
                      </p>
                      <div className="space-y-2">
                        {group.loops.map((loop) => (
                          <div key={loop.id} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
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
                    <div key={loop.id} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
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
