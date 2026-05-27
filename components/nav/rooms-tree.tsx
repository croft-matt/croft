'use client'

import { useState, useEffect, useRef, useTransition, useId } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  MoreHorizontal,
  GripVertical,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { RoomWithOverdue } from '@/lib/queries/cockpit'
import { renameRoom, archiveRoom, reorderRooms, reparentRoom } from '@/lib/rooms/actions'
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
  workspaceId: string
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

// Walk the tree and find a node by ID, returning it and its parent ID.
function findNodeAndParent(
  nodes: RoomNode[],
  id: string,
  parentId: string | null = null,
): { node: RoomNode; parentId: string | null } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, parentId }
    const found = findNodeAndParent(node.children, id, node.id)
    if (found) return found
  }
  return null
}

// Return all sibling nodes for a given parent ID (null = root).
function getSiblings(nodes: RoomNode[], parentId: string | null): RoomNode[] {
  if (parentId === null) return nodes
  const result = findNodeAndParent(nodes, parentId)
  return result?.node.children ?? []
}

// Replace siblings under a given parent ID with a new array.
function replaceSiblings(
  nodes: RoomNode[],
  parentId: string | null,
  newSiblings: RoomNode[],
): RoomNode[] {
  if (parentId === null) return newSiblings
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: newSiblings }
    return { ...n, children: replaceSiblings(n.children, parentId, newSiblings) }
  })
}

// Move a node from its current position and nest it under newParentId.
function moveNodeToParent(
  nodes: RoomNode[],
  nodeId: string,
  newParentId: string,
): RoomNode[] {
  let extracted: RoomNode | null = null

  function remove(ns: RoomNode[]): RoomNode[] {
    return ns.reduce<RoomNode[]>((acc, n) => {
      if (n.id === nodeId) {
        extracted = n
        return acc
      }
      return [...acc, { ...n, children: remove(n.children) }]
    }, [])
  }

  const withoutNode = remove(nodes)
  if (!extracted) return nodes

  function insertUnder(ns: RoomNode[]): RoomNode[] {
    return ns.map((n) => {
      if (n.id === newParentId) {
        return { ...n, children: [...n.children, extracted!] }
      }
      return { ...n, children: insertUnder(n.children) }
    })
  }

  return insertUnder(withoutNode)
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

type RoomEntry = Pick<RoomWithOverdue, 'id' | 'name' | 'parent_room_id'>

interface RoomRowProps {
  node: RoomNode
  depth: number
  expandedIds: Set<string>
  onToggle: (id: string) => void
  pathname: string
  allRooms: RoomEntry[]
  isReorderTarget: boolean
  isNestTarget: boolean
  isDraggingParent: boolean
  isOverlay?: boolean
}

function RoomRow({
  node,
  depth,
  expandedIds,
  onToggle,
  pathname,
  allRooms,
  isReorderTarget,
  isNestTarget,
  isDraggingParent,
  isOverlay,
}: RoomRowProps) {
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  // Focus rename input when entering rename mode.
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  // Sync rename value when name changes after revalidation.
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
      if (!result.success) setRenameValue(node.name)
      setIsRenaming(false)
    })
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); handleRenameConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); setIsRenaming(false); setRenameValue(node.name) }
  }

  function handleArchiveConfirm() {
    startArchiveTransition(async () => {
      await archiveRoom(node.id)
      setIsConfirmOpen(false)
    })
  }

  const isPending = renamePending || archivePending

  // When dragging a room that has children, disable nesting on child rooms.
  const nestBlocked = isDraggingParent && depth > 0

  return (
    <>
      <div
        ref={isOverlay ? undefined : setNodeRef}
        className={cn(
          'relative flex items-center gap-1.5 rounded-lg h-7 text-xs font-medium transition-colors group',
          isActive && !isOverlay
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          (isDragging && !isOverlay) && 'opacity-40',
          isPending && 'opacity-50',
          isNestTarget && !nestBlocked && 'bg-accent ring-1 ring-primary/30',
          nestBlocked && isNestTarget && 'opacity-40',
          isOverlay && 'shadow-md ring-1 ring-primary/20 bg-sidebar rounded-lg',
        )}
        style={{
          transform: isOverlay ? undefined : CSS.Transform.toString(transform),
          transition: isOverlay || isDragging ? undefined : transition,
          paddingLeft: `${depth * 12 + 2}px`,
          paddingRight: '6px',
          color: isActive && !isOverlay ? undefined : 'var(--sidebar-muted-foreground)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Reorder insertion indicator */}
        {isReorderTarget && !isNestTarget && (
          <div className="absolute top-0 left-1 right-1 h-0.5 bg-primary rounded-full -translate-y-px pointer-events-none" />
        )}

        {/* Drag grip */}
        <button
          {...(isOverlay ? {} : { ...attributes, ...listeners })}
          className="flex h-4 w-4 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground"
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical className="h-3 w-3" />
        </button>

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

        {/* Trailing: dot when not hovered, menu when hovered */}
        {!isRenaming && !isOverlay && (
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
      {!isOverlay && (
        <>
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
        </>
      )}

      {/* Children */}
      {!isOverlay && hasChildren && isExpanded && (
        <SortableContext
          items={node.children.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
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
                isReorderTarget={false}
                isNestTarget={false}
                isDraggingParent={isDraggingParent}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </>
  )
}

export function RoomsTree({ rooms, workspaceId }: RoomsTreeProps) {
  const pathname = usePathname()
  const dndId = useId()
  const [nodes, setNodes] = useState<RoomNode[]>(() => buildTree(rooms))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reorderTargetId, setReorderTargetId] = useState<string | null>(null)
  const [nestTargetId, setNestTargetId] = useState<string | null>(null)

  const nestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastNestCandidateRef = useRef<string | null>(null)
  const dragModeRef = useRef<'reorder' | 'nest' | null>(null)

  const [, startTransition] = useTransition()

  // Rebuild tree when rooms prop changes (after server revalidation).
  useEffect(() => {
    setNodes(buildTree(rooms))
  }, [rooms])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem('croft:rooms-expanded')
      if (stored) setExpandedIds(new Set(JSON.parse(stored) as string[]))
    } catch {
      // localStorage unavailable
    }
  }, [])

  function onToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      try {
        localStorage.setItem('croft:rooms-expanded', JSON.stringify([...next]))
      } catch {
        // localStorage unavailable
      }
      return next
    })
  }

  const allRooms: RoomEntry[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    parent_room_id: r.parent_room_id,
  }))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function clearNestTimer() {
    if (nestTimerRef.current) {
      clearTimeout(nestTimerRef.current)
      nestTimerRef.current = null
    }
  }

  // Check whether the active node has children (prevents nesting it — would exceed depth cap).
  function activeHasChildren(): boolean {
    if (!activeId) return false
    const found = findNodeAndParent(nodes, activeId)
    return (found?.node.children.length ?? 0) > 0
  }

  // Check whether a target node is a child (depth > 0), which would make nesting into it exceed depth cap.
  function isChildNode(id: string): boolean {
    const found = findNodeAndParent(nodes, id)
    return found?.parentId !== null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    dragModeRef.current = 'reorder'
  }

  function handleDragMove(event: DragMoveEvent) {
    const overId = event.over?.id as string | null

    if (!overId || overId === activeId) {
      clearNestTimer()
      lastNestCandidateRef.current = null
      setNestTargetId(null)
      setReorderTargetId(overId ?? null)
      dragModeRef.current = 'reorder'
      return
    }

    // Can't nest if: active has children, or target is a child (would exceed 2-level cap).
    const nestingBlocked = activeHasChildren() || isChildNode(overId)

    if (nestingBlocked) {
      clearNestTimer()
      lastNestCandidateRef.current = null
      setNestTargetId(null)
      setReorderTargetId(overId)
      dragModeRef.current = 'reorder'
      return
    }

    // Start dwell timer for nest mode if we're hovering a new candidate.
    if (lastNestCandidateRef.current !== overId) {
      clearNestTimer()
      lastNestCandidateRef.current = overId
      setReorderTargetId(overId)
      nestTimerRef.current = setTimeout(() => {
        dragModeRef.current = 'nest'
        setNestTargetId(overId)
        setReorderTargetId(null)
      }, 600)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    clearNestTimer()
    const { active, over } = event
    const mode = dragModeRef.current
    const nestTarget = nestTargetId

    setActiveId(null)
    setNestTargetId(null)
    setReorderTargetId(null)
    lastNestCandidateRef.current = null
    dragModeRef.current = null

    if (!over || active.id === over.id) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    if (mode === 'nest' && nestTarget) {
      // Depth cap already enforced in handleDragMove — safe to proceed.
      const snapshot = nodes
      const newNodes = moveNodeToParent(nodes, activeIdStr, nestTarget)
      setNodes(newNodes)

      startTransition(async () => {
        const result = await reparentRoom(workspaceId, activeIdStr, nestTarget)
        if (!result.success) setNodes(snapshot)
      })
      return
    }

    // Reorder: find the sibling group and arrayMove within it.
    const activeInfo = findNodeAndParent(nodes, activeIdStr)
    if (!activeInfo) return

    const siblings = getSiblings(nodes, activeInfo.parentId)
    const oldIndex = siblings.findIndex((n) => n.id === activeIdStr)
    const newIndex = siblings.findIndex((n) => n.id === overIdStr)
    if (oldIndex === -1 || newIndex === -1) return

    const newSiblings = arrayMove(siblings, oldIndex, newIndex)
    const newNodes = replaceSiblings(nodes, activeInfo.parentId, newSiblings)
    const snapshot = nodes
    setNodes(newNodes)

    startTransition(async () => {
      const result = await reorderRooms(
        workspaceId,
        newSiblings.map((n: RoomNode) => n.id),
        activeInfo.parentId,
      )
      if (!result.success) setNodes(snapshot)
    })
  }

  const draggingParent = activeHasChildren()

  const activeNode = activeId ? findNodeAndParent(nodes, activeId)?.node ?? null : null

  if (nodes.length === 0) {
    return (
      <p className="px-2 text-xs" style={{ color: 'var(--sidebar-muted-foreground)' }}>
        No rooms yet.
      </p>
    )
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {nodes.map((node) => (
            <RoomRow
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              onToggle={onToggle}
              pathname={pathname}
              allRooms={allRooms}
              isReorderTarget={reorderTargetId === node.id}
              isNestTarget={nestTargetId === node.id}
              isDraggingParent={draggingParent}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeNode && (
          <RoomRow
            node={activeNode}
            depth={0}
            expandedIds={new Set()}
            onToggle={() => {}}
            pathname={pathname}
            allRooms={[]}
            isReorderTarget={false}
            isNestTarget={false}
            isDraggingParent={false}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
