import Link from 'next/link'
import type { Room, Job } from '@/lib/types/database'

interface RoomHeaderProps {
  room: Room
  parent: Pick<Room, 'id' | 'name'> | null
  jobs: Job[]
  childRooms?: Room[]
}

export function RoomHeader({ room, parent, jobs, childRooms }: RoomHeaderProps) {
  const openJobs = jobs.filter((j) => j.status === 'open')
  const closedJobs = jobs.filter((j) => j.status === 'closed')
  const overdueJobs = openJobs.filter((j) => j.due && new Date(j.due) < new Date())
  const hasProgress = jobs.length > 0
  const progressPct = hasProgress ? Math.round((closedJobs.length / jobs.length) * 100) : 0
  // Leaf rooms (no children) show a progress bar; parent rooms show a child room grid instead.
  const isLeaf = !childRooms || childRooms.length === 0

  return (
    <div className="border-b border-border px-6 py-5">
      {parent && (
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={`/rooms/${parent.id}`} className="hover:text-foreground transition-colors">
            {parent.name}
          </Link>
          <span>/</span>
          <span className="text-muted-foreground">{room.name}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-lg font-medium text-foreground">{room.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {closedJobs.length > 0 && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {closedJobs.length} closed
            </span>
          )}
          {overdueJobs.length > 0 && (
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
              {overdueJobs.length} overdue
            </span>
          )}
        </div>
      </div>

      {hasProgress && isLeaf && (
          <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-muted-foreground transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{progressPct}%</span>
        </div>
      )}
    </div>
  )
}
