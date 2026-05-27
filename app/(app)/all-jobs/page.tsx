import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { getAllJobs } from '@/lib/queries/all-jobs'
import { JobRow } from '@/components/jobs/job-row'

export default async function AllJobsPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const { yourCourt, theirCourt } = await getAllJobs(workspaceId)
  const total = yourCourt.length + theirCourt.length

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">All jobs</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {total === 0
          ? 'No open jobs.'
          : `${total} open ${total === 1 ? 'job' : 'jobs'} across all rooms`}
      </p>

      {total === 0 && (
        <p className="text-sm text-muted-foreground">Nothing to do right now.</p>
      )}

      {yourCourt.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Your court
            </span>
            <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              {yourCourt.length}
            </span>
          </div>
          <div className="space-y-2">
            {yourCourt.map((job) => (
              <JobRow
                key={`${job.id}-${job.roomId}`}
                job={{
                  id: job.id,
                  description: job.description,
                  owner: job.owner,
                  due: job.due,
                  emailId: job.emailId,
                  status: 'open',
                  roomName: job.roomName,
                  isOverdue: job.isOverdue,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {theirCourt.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Their court
            </span>
            <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
              {theirCourt.length}
            </span>
          </div>
          <div className="space-y-2">
            {theirCourt.map((job) => (
              <JobRow
                key={`${job.id}-${job.roomId}`}
                job={{
                  id: job.id,
                  description: job.description,
                  owner: job.owner,
                  due: job.due,
                  emailId: job.emailId,
                  status: 'open',
                  roomName: job.roomName,
                  ageDays: job.ageDays,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
