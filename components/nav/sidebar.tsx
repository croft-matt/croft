'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Settings, Home, Users, Paperclip, CheckSquare, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RoomsTree } from '@/components/nav/rooms-tree'
import { NotificationBell } from '@/components/nav/notification-bell'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createRoom } from '@/lib/rooms/actions'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'

interface SidebarProps {
  rooms: RoomWithOverdue[]
  workspaceId: string
  unreadCount: number
}

const topNavItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/all-jobs', label: 'All jobs', icon: CheckSquare },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/assets', label: 'Assets', icon: Paperclip },
]

export function Sidebar({ rooms, workspaceId, unreadCount }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [roomsOpen, setRoomsOpen] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()

  function openDialog() {
    setName('')
    setDescription('')
    setDialogOpen(true)
  }

  function closeDialog() {
    if (isPending) return
    setDialogOpen(false)
    setName('')
    setDescription('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await createRoom(workspaceId, trimmed, description || null)
      if (result.success) {
        setDialogOpen(false)
        setName('')
        setDescription('')
        if (result.roomId) router.push(`/rooms/${result.roomId}`)
      }
    })
  }

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
        <NotificationBell workspaceId={workspaceId} initialCount={unreadCount} />
      </div>

      {/* Middle zone — rooms */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 min-h-0 space-y-4">

        {/* Rooms section */}
        <div>
          <div className="flex items-center mb-1">
            <button
              onClick={() => setRoomsOpen((v) => !v)}
              className="flex flex-1 items-center rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50 transition-colors"
            >
              <span className="text-xs font-medium" style={{ color: 'var(--sidebar-muted-foreground)' }}>
                Rooms
              </span>
            </button>
            <button
              onClick={openDialog}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-sidebar-accent/50 transition-colors"
              style={{ color: 'var(--sidebar-muted-foreground)' }}
              aria-label="Create a room"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {roomsOpen && <RoomsTree rooms={rooms} workspaceId={workspaceId} />}
        </div>

        {/* Create room dialog (AI rooms section plus button) */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
          <DialogContent showCloseButton={false} className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New room</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Room name"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isPending}
                />
                <div className="relative">
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 120))}
                    placeholder="What's this room for? (helps Croft route emails)"
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isPending}
                  />
                  {description.length > 0 && (
                    <span className="absolute right-3 bottom-3 text-xs tabular-nums text-muted-foreground pointer-events-none">
                      {description.length}/120
                    </span>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending || !name.trim()}>
                  {isPending ? 'Creating...' : 'Create room'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
