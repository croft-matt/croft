'use client'

import type { Job, Asset } from '@/lib/types/database'
import { JobRow } from '@/components/jobs/job-row'

interface JobsListProps {
  jobs: Job[]
  assets?: Asset[]
  // Jobs that were closed by this email (closed_by_email_id = emailId).
  closedByThisEmail?: Job[]
}

export function JobsList({ jobs, assets: _assets = [], closedByThisEmail = [] }: JobsListProps) {
  const now = new Date()

  const openJobs = jobs.filter((j) => j.status === 'open')
  const closedJobs = jobs.filter((j) => j.status === 'closed' || j.status === 'noted')
  const allRendered = [...openJobs, ...closedJobs]

  const hasAnything = allRendered.length > 0 || closedByThisEmail.length > 0

  if (!hasAnything) return null

  return (
    <div className="space-y-4">
      {allRendered.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Jobs</p>
            {openJobs.length > 0 && (
              <span className="text-xs text-muted-foreground">{openJobs.length} open</span>
            )}
          </div>
          <div className="space-y-2">
            {allRendered.map((job) => (
              <JobRow
                key={job.id}
                job={{
                  id: job.id,
                  description: job.description,
                  owner: job.owner,
                  due: job.due,
                  emailId: job.email_id,
                  status: job.status === 'noted' ? 'closed' : job.status,
                  isOverdue: job.status === 'open' && !!job.due && new Date(job.due) < now,
                  updatedAt: job.updated_at,
                  closedAt: job.closed_at,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {closedByThisEmail.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Resolved by this email
          </p>
          <div className="space-y-2">
            {closedByThisEmail.map((job) => (
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
                  updatedAt: job.updated_at,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
