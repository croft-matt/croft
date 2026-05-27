'use client'

import { useState, useTransition, useRef, useId } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reorderRooms, reparentRoom } from '@/lib/rooms/actions'
import type { MyRoom } from '@/lib/queries/cockpit'

interface SortableMyRoomsProps {
  initialRooms: MyRoom[]
  workspaceId: string
}

interface RowProps {
  room: MyRoom
  isReorderTarget: boolean
  isNestTarget: boolean
  isOverlay?: boolean
}

function MyRoomRow({ room, isReorderTarget, isNestTarget, isOverlay }: RowProps) {
  const pathname = usePathname()
  const isActive = pathname === `/rooms/${room.id}`

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
  })

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      className={cn(
        'relative flex items-center gap-1 rounded-lg h-auto min-h-7 py-1 px-2 text-xs font-medium transition-colors group',
        isActive && !isOverlay
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        isDragging && !isOverlay && 'opacity-40',
        isNestTarget && 'bg-accent ring-1 ring-primary/30',
        isOverlay && 'shadow-md ring-1 ring-primary/20 bg-sidebar rounded-lg',
      )}
      style={{
        transform: isOverlay ? undefined : CSS.Transform.toString(transform),
        transition: isOverlay || isDragging ? undefined : transition,
        color: isActive && !isOverlay ? undefined : 'var(--sidebar-muted-foreground)',
      }}
    >
      {/* Reorder insertion indicator */}
      {isReorderTarget && (
        <div className="absolute top-0 left-1 right-1 h-0.5 bg-primary rounded-full -translate-y-px pointer-events-none" />
      )}

      {/* Grip handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex h-4 w-4 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Room name + description */}
      <Link href={`/rooms/${room.id}`} className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="truncate">{room.name}</span>
        {room.description && (
          <span
            className="truncate text-[10px] font-normal mt-0.5"
            style={{ color: 'var(--sidebar-muted-foreground)', opacity: 0.7 }}
          >
            {room.description}
          </span>
        )}
      </Link>
    </div>
  )
}

export function SortableMyRooms({ initialRooms, workspaceId }: SortableMyRoomsProps) {
  const dndId = useId()
  const [rooms, setRooms] = useState<MyRoom[]>(initialRooms)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [reorderTargetId, setReorderTargetId] = useState<string | null>(null)
  const [nestTargetId, setNestTargetId] = useState<string | null>(null)

  // Timer ref for the 600ms dwell before switching to nest mode.
  const nestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragModeRef = useRef<'reorder' | 'nest' | null>(null)

  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeRoom = rooms.find((r) => r.id === activeId) ?? null

  function clearNestTimer() {
    if (nestTimerRef.current) {
      clearTimeout(nestTimerRef.current)
      nestTimerRef.current = null
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    dragModeRef.current = 'reorder'
  }

  function handleDragMove(event: DragMoveEvent) {
    const overId = event.over?.id as string | null
    if (!overId || overId === activeId) {
      clearNestTimer()
      setNestTargetId(null)
      setReorderTargetId(overId ?? null)
      dragModeRef.current = 'reorder'
      return
    }

    // My rooms are flat — no nesting allowed (they have no parent_room_id).
    // So My rooms only support reorder, not nest.
    clearNestTimer()
    setNestTargetId(null)
    setReorderTargetId(overId)
    dragModeRef.current = 'reorder'
  }

  function handleDragEnd(event: DragEndEvent) {
    clearNestTimer()
    const { active, over } = event
    setActiveId(null)
    setNestTargetId(null)
    setReorderTargetId(null)
    dragModeRef.current = null

    if (!over || active.id === over.id) return

    const oldIndex = rooms.findIndex((r) => r.id === active.id)
    const newIndex = rooms.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(rooms, oldIndex, newIndex)
    setRooms(newOrder)

    const snapshot = [...rooms]
    startTransition(async () => {
      const result = await reorderRooms(
        workspaceId,
        newOrder.map((r: MyRoom) => r.id),
        'my-rooms',
      )
      if (!result.success) setRooms(snapshot)
    })
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rooms.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {rooms.map((room) => (
            <MyRoomRow
              key={room.id}
              room={room}
              isReorderTarget={reorderTargetId === room.id}
              isNestTarget={nestTargetId === room.id}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeRoom && (
          <MyRoomRow
            room={activeRoom}
            isReorderTarget={false}
            isNestTarget={false}
            isOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
