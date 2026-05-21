import type { Job } from '@/lib/types/database'

const INTENT_LABEL: Record<string, string> = {
  REQUEST: 'Request',
  DELIVER: 'Deliver',
  CONFIRM: 'Confirm',
  CHASE: 'Chase',
  QUERY: 'Query',
  INTRODUCE: 'Introduce',
}

interface JobHeaderProps {
  job: Job
  roomName: string | null
  senderName: string | null
}

export function JobHeader({ job, roomName, senderName }: JobHeaderProps) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-neutral-800">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase tracking-wide">
          {INTENT_LABEL[job.intent] ?? job.intent}
        </span>
        {roomName && (
          <span className="text-[11px] text-neutral-600 truncate">{roomName}</span>
        )}
      </div>
      <p className="text-sm font-medium text-white leading-snug">{job.description}</p>
      {senderName && (
        <p className="mt-1 text-xs text-neutral-500">From {senderName}</p>
      )}
    </div>
  )
}
