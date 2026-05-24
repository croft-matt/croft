import Link from 'next/link'
import type { Room } from '@/lib/types/database'
import type { StackEntry, SuggestionEntry } from '@/lib/blocks/registry'
import { BlockStack } from '@/components/room/block-stack'
import { SuggestionsRail } from '@/components/room/suggestions-rail'

interface OverviewTabProps {
  roomId: string
  childRooms: Room[]
  stack: StackEntry[]
  suggestions: SuggestionEntry[]
}

function ChildRoomCard({ room }: { room: Room }) {
  const hasProg = room.progress_total > 0
  const pct = hasProg ? Math.round((room.progress_closed / room.progress_total) * 100) : 0

  return (
    <Link
      href={`/rooms/${room.id}`}
      className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3.5 hover:bg-neutral-800 transition-colors"
    >
      <p className="text-sm font-semibold text-white mb-2 truncate">{room.name}</p>
      {hasProg && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-neutral-500 tabular-nums w-7 text-right">{pct}%</span>
        </div>
      )}
      <p className="text-xs text-neutral-600">
        {room.progress_closed} closed
        {room.progress_total > room.progress_closed && ` · ${room.progress_total - room.progress_closed} open`}
      </p>
    </Link>
  )
}

export function OverviewTab({ roomId, childRooms, stack, suggestions }: OverviewTabProps) {
  const isParent = childRooms.length > 0

  return (
    <div className="space-y-6">
      {isParent && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Sub-rooms
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {childRooms.map((child) => (
              <ChildRoomCard key={child.id} room={child} />
            ))}
          </div>
        </div>
      )}

      <BlockStack stack={stack} />

      <SuggestionsRail suggestions={suggestions} roomId={roomId} />
    </div>
  )
}
