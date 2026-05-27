'use client'

import { useState } from 'react'
import { JobRow } from '@/components/jobs/job-row'
import type { OpenLoops, OpenLoop } from '@/lib/jobs/open-loops'
import type { RoomJob } from '@/lib/blocks/types'

interface JobsTabProps {
  loops: OpenLoops
  connectedAddresses: string[]
  workspaceId: string
  closedJobs?: RoomJob[]
}

export function JobsTab({ loops, connectedAddresses, closedJobs = [] }: JobsTabProps) {
  const [closedExpanded, setClosedExpanded] = useState(true)

  const { yourCourt, theirCourt } = loops
  const connectedSet = new Set(connectedAddresses.map((a) => a.toLowerCase()))

  // Merge all open loops and sort by updated_at descending so the most recently
  // touched jobs (e.g. chased by an incoming email) appear at the top.
  const allOpen: OpenLoop[] = [...yourCourt, ...theirCourt].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  // Chase count map for the "restated Nx" badge.
  const chaseCountMap = new Map<string, number>()
  for (const loop of allOpen) {
    if (loop.parent_job_id) {
      chaseCountMap.set(loop.parent_job_id, (chaseCountMap.get(loop.parent_job_id) ?? 0) + 1)
    }
  }

  const now = new Date()

  return (
    <div className="space-y-8">
      {/* Open */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Open
          </p>
          <span className="text-[13px] text-muted-foreground">{allOpen.length}</span>
        </div>

        {allOpen.length === 0 ? (
          <p className="text-sm text-muted-foreground">All jobs in this room are closed.</p>
        ) : (
          <div className="space-y-2">
            {allOpen.map((loop) => {
              const isYours = loop.owner != null && connectedSet.has(loop.owner.toLowerCase())
              return (
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
                    ageDays: !isYours ? loop.age_days : undefined,
                    updatedAt: loop.updated_at,
                    isYours,
                  }}
                  chaseCount={chaseCountMap.get(loop.id)}
                />
              )
            })}
          </div>
        )}
      </section>

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
