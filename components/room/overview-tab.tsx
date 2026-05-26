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
      className="block rounded-xl border border-border bg-card px-4 py-3.5 hover:bg-muted transition-colors"
    >
      <p className="text-sm font-semibold text-foreground mb-2 truncate">{room.name}</p>
      {hasProg && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[13px] text-muted-foreground tabular-nums w-7 text-right">{pct}%</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
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
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sub-rooms
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {childRooms.map((child) => (
              <ChildRoomCard key={child.id} room={child} />
            ))}
          </div>
        </div>
      )}

      <SuggestionsRail suggestions={suggestions} roomId={roomId} />

      <BlockStack stack={stack} />
    </div>
  )
}
