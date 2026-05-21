import Link from 'next/link'
import { Settings } from 'lucide-react'
import { RoomsTree } from '@/components/nav/rooms-tree'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'

interface SidebarProps {
  workspaceName: string
  userName: string
  rooms: RoomWithOverdue[]
}

export function Sidebar({ workspaceName, userName, rooms }: SidebarProps) {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-neutral-800 bg-neutral-950 sticky top-0">
      {/* Top zone */}
      <div className="px-4 pt-5 pb-4 border-b border-neutral-800">
        <p className="text-sm font-semibold text-white truncate">{workspaceName}</p>
        <p className="text-xs text-neutral-500 truncate mt-0.5">{userName}</p>
      </div>

      {/* Middle zone — rooms tree */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Rooms
        </p>
        <RoomsTree rooms={rooms} />
      </div>

      {/* Bottom zone */}
      <div className="border-t border-neutral-800 px-3 py-3 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
