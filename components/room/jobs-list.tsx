'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'
import type { Job, JobIntent } from '@/lib/types/database'

interface JobsListProps {
  jobs: Job[]
}

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
  CONFIRM: { label: 'CONFIRM', className: 'bg-neutral-500/10 text-neutral-300' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
  QUERY: { label: 'QUERY', className: 'bg-neutral-500/10 text-neutral-400' },
  INTRODUCE: { label: 'INTRODUCE', className: 'bg-purple-500/10 text-purple-400' },
}

function getStatusDot(job: Job): string {
  if (!job.due) return 'bg-neutral-600'
  const due = new Date(job.due)
  const now = new Date()
  if (due < now) return 'bg-red-500'
  if (due < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-neutral-500'
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function JobsList({ jobs }: JobsListProps) {
  const { open } = useJobModal()
  const [showClosed, setShowClosed] = useState(false)

  const openJobs = jobs.filter((j) => j.status === 'open')
  const closedJobs = jobs.filter((j) => j.status !== 'open')

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-600">No jobs in this room yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Jobs</p>
        {openJobs.length > 0 && (
          <span className="text-xs text-neutral-500">{openJobs.length} open</span>
        )}
      </div>

      <div className="divide-y divide-neutral-800">
        {openJobs.map((job) => {
          const intent = intentConfig[job.intent as JobIntent]
          return (
            <button
              key={job.id}
              onClick={() => open(job)}
              className="flex w-full items-start gap-3 py-3 first:pt-0 text-left hover:opacity-80 transition-opacity"
            >
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', getStatusDot(job))} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start gap-2 mb-0.5">
                  <span className={cn('inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide', intent.className)}>
                    {intent.label}
                  </span>
                  <span className="text-sm font-medium text-neutral-100 leading-snug">{job.description}</span>
                </div>
                {(job.owner || job.due) && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {[job.owner, job.due ? formatDue(job.due) : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {closedJobs.length > 0 && (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {showClosed ? 'Hide' : `Show ${closedJobs.length} closed job${closedJobs.length > 1 ? 's' : ''}`}
          </button>
          {showClosed && (
            <div className="mt-2 divide-y divide-neutral-800 opacity-50">
              {closedJobs.map((job) => (
                <div key={job.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-600" />
                  <p className="text-sm text-neutral-400 line-through">{job.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
