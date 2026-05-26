'use client'

import type { Job, JobIntent } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'

interface JobsListProps {
  jobs: Job[]
}

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
  CONFIRM: { label: 'CONFIRM', className: 'bg-muted text-foreground' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
  QUERY: { label: 'QUERY', className: 'bg-muted text-muted-foreground' },
  INTRODUCE: { label: 'INTRODUCE', className: 'bg-purple-500/10 text-purple-400' },
}

function getStatusDot(job: Job): string {
  if (job.status !== 'open') return 'bg-muted-foreground'
  if (!job.due) return 'bg-muted-foreground'
  const dueDate = new Date(job.due)
  const now = new Date()
  if (dueDate < now) return 'bg-red-500'
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  if (dueDate < sevenDays) return 'bg-amber-500'
  return 'bg-muted-foreground'
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function JobsList({ jobs }: JobsListProps) {
  const { open } = useJobModal()
  const openJobs = jobs.filter((j) => j.status === 'open')
  const closedJobs = jobs.filter((j) => j.status !== 'open')

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jobs</p>
        {openJobs.length > 0 && (
          <span className="text-xs text-muted-foreground">{openJobs.length} open</span>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs extracted from this email.</p>
      ) : (
        <div className="divide-y divide-border">
          {[...openJobs, ...closedJobs].map((job) => {
            const intent = intentConfig[job.intent as JobIntent]
            const dotClass = getStatusDot(job)
            const isClosed = job.status !== 'open'

            return (
              <div
                key={job.id}
                onClick={isClosed ? undefined : () => open(job)}
                className={cn(
                  'flex items-start gap-3 py-3 first:pt-0 last:pb-0',
                  isClosed ? 'opacity-40' : 'cursor-pointer hover:opacity-80 transition-opacity'
                )}
              >
                <div
                  className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dotClass)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[13px] font-semibold tracking-wide',
                        intent.className
                      )}
                    >
                      {intent.label}
                    </span>
                    <p
                      className={cn(
                        'text-sm font-medium leading-snug',
                        isClosed ? 'line-through text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {job.description}
                    </p>
                  </div>
                  {(job.owner || job.due) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[job.owner, job.due ? formatDue(job.due) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
