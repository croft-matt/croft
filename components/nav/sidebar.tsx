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
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar sticky top-0">
      {/* Top zone */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <p className="text-sm font-semibold text-sidebar-foreground truncate">{workspaceName}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{userName}</p>
      </div>

      {/* Middle zone — rooms tree */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Rooms
        </p>
        <RoomsTree rooms={rooms} />
      </div>

      {/* Bottom zone */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
