import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { OverdueJob } from '@/lib/queries/home'

function daysOverdue(due: string): number {
  return Math.ceil((Date.now() - new Date(due).getTime()) / (1000 * 60 * 60 * 24))
}

interface OverdueSectionProps {
  jobs: OverdueJob[]
}

export function OverdueSection({ jobs }: OverdueSectionProps) {
  if (jobs.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-semibold text-foreground">Overdue</h2>
        <span className="text-xs text-muted-foreground">{jobs.length}</span>
      </div>
      <div className="space-y-1.5">
        {jobs.map((job) => {
          const days = daysOverdue(job.due)
          const href = job.roomId ? `/rooms/${job.roomId}` : `/emails/${job.emailId}`
          const isVeryOverdue = days >= 7

          return (
            <Link
              key={job.id}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  isVeryOverdue ? 'bg-red-500' : 'bg-amber-500'
                )}
              />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{job.description}</p>
                {(job.fromName || job.roomName) && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[job.fromName, job.roomName].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              <span
                className={cn(
                  'shrink-0 text-xs font-medium tabular-nums whitespace-nowrap',
                  isVeryOverdue ? 'text-red-400' : 'text-amber-400'
                )}
              >
                {days}d overdue
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
