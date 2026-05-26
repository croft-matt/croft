'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'
import { renameRoom, archiveRoom } from '@/lib/rooms/actions'
import { MoveRoomDialog } from '@/components/room/move-room-dialog'
import { ConfirmDialog } from '@/components/room/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface RoomsTreeProps {
  rooms: RoomWithOverdue[]
}

interface RoomNode extends RoomWithOverdue {
  children: RoomNode[]
}

function buildTree(rooms: RoomWithOverdue[]): RoomNode[] {
  const map = new Map<string, RoomNode>()
  rooms.forEach((r) => map.set(r.id, { ...r, children: [] }))

  const roots: RoomNode[] = []
  map.forEach((node) => {
    if (node.parent_room_id && map.has(node.parent_room_id)) {
      map.get(node.parent_room_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function getStatusDot(room: RoomWithOverdue): 'red' | 'amber' | 'white' | null {
  if (room.progress_total === 0) return null
  if (room.has_overdue) return 'red'
  if (room.progress_closed === room.progress_total) return 'white'
  return 'amber'
}

const dotClass = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  white: 'bg-foreground',
}

// Flat room list for the move dialog (id, name, parent_room_id only).
type RoomEntry = Pick<RoomWithOverdue, 'id' | 'name' | 'parent_room_id'>

interface RoomRowProps {
  node: RoomNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  pathname: string
  allRooms: RoomEntry[]
}

function RoomRow({ node, depth, expandedIds, onToggle, pathname, allRooms }: RoomRowProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isActive = pathname === `/rooms/${node.id}`
  const dot = getStatusDot(node)

  const [isHovered, setIsHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [renamePending, startRenameTransition] = useTransition()
  const [archivePending, startArchiveTransition] = useTransition()

  const renameInputRef = useRef<HTMLInputElement>(null)

  // Focus rename input when entering rename mode.
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  // Sync rename value if the node name changes after revalidation.
  useEffect(() => {
    setRenameValue(node.name)
  }, [node.name])

  function handleRenameConfirm() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === node.name) {
      setIsRenaming(false)
      setRenameValue(node.name)
      return
    }
    startRenameTransition(async () => {
      const result = await renameRoom(node.id, trimmed)
      if (!result.success) {
        setRenameValue(node.name)
      }
      setIsRenaming(false)
    })
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Stop propagation so events don't bubble to the row's click handlers.
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsRenaming(false)
      setRenameValue(node.name)
    }
  }

  function handleArchive() {
    setMenuOpen(false)
    setIsConfirmOpen(true)
  }

  function handleArchiveConfirm() {
    startArchiveTransition(async () => {
      await archiveRoom(node.id)
      setIsConfirmOpen(false)
    })
  }

  const isPending = renamePending || archivePending

  return (
    <>
      <div
        className={cn(
          'relative flex items-center gap-1.5 rounded-lg h-7 text-xs font-medium transition-colors group',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          isPending && 'opacity-50',
        )}
        style={{
          paddingLeft: `${depth * 12 + 6}px`,
          paddingRight: '6px',
          color: isActive ? undefined : 'var(--sidebar-muted-foreground)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false)
          // Don't close menu on mouse leave -- user may be moving to the menu.
        }}
      >
        {/* Expand / collapse chevron */}
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0" />
        )}

        {/* Room name: link normally, input when renaming */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameConfirm}
            onKeyDown={handleRenameKeyDown}
            disabled={renamePending}
            className="flex-1 min-w-0 bg-transparent text-xs font-medium text-foreground border-b border-border focus:outline-none focus:border-primary disabled:opacity-50"
          />
        ) : (
          <Link href={`/rooms/${node.id}`} className="flex-1 truncate leading-5">
            {renameValue}
          </Link>
        )}

        {/* Trailing: dot when not hovered, menu button when hovered */}
        {!isRenaming && (
          <div className="h-4 w-4 shrink-0 flex items-center justify-center">
            {isHovered || menuOpen ? (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger
                  className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Room actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsMoveOpen(true)}>
                    Move to...
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setIsConfirmOpen(true)}
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : dot ? (
              <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[dot])} />
            ) : null}
          </div>
        )}
      </div>

      {/* Dialogs rendered outside the row div so they are not clipped */}
      <MoveRoomDialog
        roomId={node.id}
        roomName={node.name}
        currentParentId={node.parent_room_id ?? null}
        allRooms={allRooms}
        open={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
      />

      <ConfirmDialog
        open={isConfirmOpen}
        title={`Archive "${node.name}"?`}
        description="This room will be hidden from your workspace. Any sub-rooms will move to the top level. You can recover it from the database if needed."
        confirmLabel="Archive"
        onConfirm={handleArchiveConfirm}
        onClose={() => setIsConfirmOpen(false)}
        isPending={archivePending}
      />

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <RoomRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              pathname={pathname}
              allRooms={allRooms}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function RoomsTree({ rooms }: RoomsTreeProps) {
  const pathname = usePathname()
  const tree = buildTree(rooms)

  // Flat list passed down to every RoomRow for the move dialog.
  const allRooms: RoomEntry[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    parent_room_id: r.parent_room_id,
  }))

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem('croft:rooms-expanded')
      if (stored) {
        setExpandedIds(new Set(JSON.parse(stored) as string[]))
      }
    } catch {
      // localStorage unavailable
    }
  }, [])

  function onToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      try {
        localStorage.setItem('croft:rooms-expanded', JSON.stringify([...next]))
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }

  if (tree.length === 0) {
    return (
      <p className="px-2 text-xs" style={{ color: 'var(--sidebar-muted-foreground)' }}>
        No rooms yet.
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <RoomRow
          key={node.id}
          node={node}
          depth={0}
          expandedIds={expandedIds}
          onToggle={onToggle}
          pathname={pathname}
          allRooms={allRooms}
        />
      ))}
    </div>
  )
}
