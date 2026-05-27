'use client'

import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useJobModal } from '@/stores/job-modal-store'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { cn } from '@/lib/utils'

export interface JobRowData {
  id: string
  description: string
  owner: string | null
  due: string | null
  emailId: string | null
  status: string
  // For cross-room views — omit when rendering inside a room
  roomName?: string | null
  // Silence in days — for their court rows
  ageDays?: number
  isOverdue?: boolean
}

interface JobRowProps {
  job: JobRowData
  /** Show chase count badge (room jobs tab only) */
  chaseCount?: number
  className?: string
}

function formatDue(iso: string, isOverdue: boolean): string {
  const d = new Date(iso)
  if (isOverdue) {
    const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    return days === 1 ? '1d overdue' : `${days}d overdue`
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function JobRow({ job, chaseCount, className }: JobRowProps) {
  const { open: openModal } = useJobModal()
  const { open: openEmail } = useEmailSidePanel()

  const isClosed = job.status === 'closed'

  function handleRowClick() {
    if (job.emailId) {
      openEmail(job.emailId)
    }
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3',
        isClosed && 'opacity-60',
        className,
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          isClosed
            ? 'bg-muted-foreground'
            : job.isOverdue
            ? 'bg-red-500'
            : job.due
            ? 'bg-amber-500'
            : 'bg-muted-foreground',
        )}
      />

      {/* Main content — clicking opens email side panel */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleRowClick()
        }}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <p className={cn('text-sm leading-snug', isClosed ? 'line-through text-muted-foreground' : 'text-foreground')}>
          {job.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {job.roomName && (
            <span className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {job.roomName}
            </span>
          )}
          {job.owner && (
            <span className="text-xs text-muted-foreground truncate">{job.owner}</span>
          )}
          {job.due && (
            <span className={cn('text-xs', job.isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
              {formatDue(job.due, job.isOverdue ?? false)}
            </span>
          )}
          {job.ageDays !== undefined && !job.due && (
            <span className="text-xs text-muted-foreground">
              silent {job.ageDays}d
            </span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex shrink-0 items-center gap-1">
        {chaseCount && chaseCount > 0 ? (
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            restated {chaseCount}x
          </span>
        ) : null}

        {/* Three-dot menu — visible on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            aria-label="Job options"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => openModal(job.id)}>
              View details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
