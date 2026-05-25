'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Settings, ChevronDown, ChevronRight, Zap, Users, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoomsTree } from '@/components/nav/rooms-tree'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'

interface SidebarProps {
  rooms: RoomWithOverdue[]
}

const topNavItems = [
  { href: '/', label: 'Urgent', icon: Zap },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/assets', label: 'Assets', icon: Paperclip },
]

export function Sidebar({ rooms }: SidebarProps) {
  const pathname = usePathname()
  const [roomsOpen, setRoomsOpen] = useState(true)

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar sticky top-0">
      {/* Logo */}
      <div className="pl-6 pr-4 pt-6 pb-8">
        <Image
          src="/croft-logo-dark.png"
          alt="Croft"
          width={52}
          height={17}
          className="block dark:hidden"
          priority
        />
        <Image
          src="/croft-logo-light.png"
          alt="Croft"
          width={52}
          height={17}
          className="hidden dark:block"
          priority
        />
      </div>

      {/* Top nav items */}
      <div className="px-3">
        {topNavItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
              style={{ color: isActive ? undefined : 'var(--sidebar-muted-foreground)' }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Middle zone — rooms tree */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 min-h-0">
        {/* Rooms section header */}
        <button
          onClick={() => setRoomsOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 mb-1 hover:bg-sidebar-accent/50 transition-colors group"
        >
          <span className="text-xs font-medium" style={{ color: 'var(--sidebar-muted-foreground)' }}>
            Rooms
          </span>
          {roomsOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'var(--sidebar-muted-foreground)' }} />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--sidebar-muted-foreground)' }} />
          )}
        </button>

        {roomsOpen && <RoomsTree rooms={rooms} />}
      </div>

      {/* Bottom zone */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
            'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
          )}
          style={{ color: 'var(--sidebar-muted-foreground)' }}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
