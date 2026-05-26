import Link from 'next/link'
import type { OverdueJobRow } from '@/lib/queries/cockpit'

interface OverdueListProps {
  jobs: OverdueJobRow[]
}

function daysOverdue(due: string): number {
  return Math.ceil((Date.now() - new Date(due).getTime()) / (1000 * 60 * 60 * 24))
}

export function OverdueList({ jobs }: OverdueListProps) {
  if (jobs.length === 0) return null

  return (
    <div>
      <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Overdue
      </p>
      <div className="space-y-0.5">
        {jobs.map((job) => {
          const days = job.due ? daysOverdue(job.due) : null
          const href = job.room_id ? `/rooms/${job.room_id}` : `/emails/${job.email_id}`

          return (
            <Link
              key={job.id}
              href={href}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-card transition-colors group"
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">
                  {job.description}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {job.from_name && <span>{job.from_name}</span>}
                  {job.from_name && job.room_name && <span> · </span>}
                  {job.room_name && <span>{job.room_name}</span>}
                </p>
              </div>
              {days !== null && (
                <span className="shrink-0 text-xs font-medium text-red-500 mt-0.5">
                  {days}d overdue
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
