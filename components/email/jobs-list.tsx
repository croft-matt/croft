'use client'

import { Paperclip } from 'lucide-react'
import type { Job, Asset, JobIntent } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'

interface JobsListProps {
  jobs: Job[]
  assets?: Asset[]
}

const intentConfig: Record<JobIntent, { label: string; className: string }> = {
  REQUEST: { label: 'REQUEST', className: 'bg-amber-500/10 text-amber-400' },
  DELIVER: { label: 'DELIVER', className: 'bg-blue-500/10 text-blue-400' },
  CONFIRM: { label: 'CONFIRM', className: 'bg-muted text-foreground' },
  CHASE: { label: 'CHASE', className: 'bg-red-500/10 text-red-400' },
  QUERY: { label: 'QUERY', className: 'bg-muted text-muted-foreground' },
  INTRODUCE: { label: 'Introduced', className: 'bg-muted text-muted-foreground' },
}

function getStatusDot(job: Job): string {
  if (job.status !== 'open') return 'bg-muted-foreground/40'
  if (!job.due) return 'bg-muted-foreground/40'
  const dueDate = new Date(job.due)
  const now = new Date()
  if (dueDate < now) return 'bg-red-500'
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  if (dueDate < sevenDays) return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}

function formatDue(due: string): string {
  return new Date(due).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Lightweight check: does any asset plausibly relate to this job description?
// Splits both strings into words and looks for a common keyword of 4+ characters.
function assetMatchesJob(job: Job, assets: Asset[]): boolean {
  const descWords = new Set(
    job.description
      .toLowerCase()
      .split(/[\s_\-./]+/)
      .filter((w) => w.length >= 4),
  )
  for (const asset of assets) {
    const assetText = `${asset.filename ?? ''} ${asset.likely_type ?? ''}`.toLowerCase()
    const assetWords = assetText.split(/[\s_\-./]+/).filter((w) => w.length >= 4)
    for (const word of assetWords) {
      if (descWords.has(word)) return true
    }
  }
  return false
}

export function JobsList({ jobs, assets = [] }: JobsListProps) {
  const { open } = useJobModal()
  const openJobs = jobs.filter((j) => j.status === 'open')
  const notedJobs = jobs.filter((j) => j.status === 'noted')
  const closedJobs = jobs.filter((j) => j.status === 'closed')

  const allRendered = [...openJobs, ...notedJobs, ...closedJobs]

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
          {allRendered.map((job) => {
            const intent = intentConfig[job.intent as JobIntent] ?? {
              label: job.intent,
              className: 'bg-muted text-muted-foreground',
            }
            const isNoted = job.status === 'noted'
            const isClosed = job.status === 'closed'
            const isClickable = !isNoted && !isClosed
            const dotClass = getStatusDot(job)
            const showPaperclip = isClickable && assets.length > 0 && assetMatchesJob(job, assets)

            return (
              <div
                key={job.id}
                onClick={isClickable ? () => open(job.id) : undefined}
                className={cn(
                  'flex items-start gap-3 py-3 first:pt-0 last:pb-0',
                  isClosed && 'opacity-40',
                  isClickable && 'cursor-pointer hover:opacity-80 transition-opacity',
                )}
              >
                <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dotClass)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[13px] font-semibold tracking-wide',
                        intent.className,
                      )}
                    >
                      {intent.label}
                    </span>
                    <p
                      className={cn(
                        'text-sm font-medium leading-snug',
                        isClosed ? 'line-through text-muted-foreground' : 'text-foreground',
                        isNoted && 'text-muted-foreground',
                      )}
                    >
                      {job.description}
                    </p>
                  </div>
                  {(job.owner || job.due) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[job.owner, job.due ? formatDue(job.due) : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {showPaperclip && (
                  <Paperclip className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
