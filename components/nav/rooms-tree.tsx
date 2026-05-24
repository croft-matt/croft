'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'

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

interface RoomRowProps {
  node: RoomNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  pathname: string
}

function RoomRow({ node, depth, expandedIds, onToggle, pathname }: RoomRowProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isActive = pathname === `/rooms/${node.id}`
  const dot = getStatusDot(node)

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 rounded-md py-1 text-sm transition-colors group',
          depth === 0 ? 'px-1' : 'px-1',
          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
        )}
        style={{ paddingLeft: `${(depth * 12) + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-sidebar-foreground transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        <Link
          href={`/rooms/${node.id}`}
          className="flex-1 truncate text-[13px] leading-5"
        >
          {node.name}
        </Link>

        {dot && (
          <span
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass[dot])}
          />
        )}
      </div>

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
            />
          ))}
        </div>
      )}
    </>
  )
}

export function RoomsTree({ rooms }: RoomsTreeProps) {
  // rooms is RoomWithOverdue[] — has_overdue comes from the query in lib/queries/cockpit.ts
  const pathname = usePathname()
  const tree = buildTree(rooms)

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
      <p className="px-2 text-xs text-muted-foreground">No rooms yet.</p>
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
        />
      ))}
    </div>
  )
}
