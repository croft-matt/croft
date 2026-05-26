'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { moveRoom } from '@/lib/rooms/actions'

interface RoomEntry {
  id: string
  name: string
  parent_room_id: string | null
}

interface MoveRoomDialogProps {
  roomId: string
  roomName: string
  currentParentId: string | null
  allRooms: RoomEntry[]
  open: boolean
  onClose: () => void
}

// Build a short label for a room: "Parent > Room" or just "Room" at root.
function buildLabel(room: RoomEntry, byId: Map<string, RoomEntry>): string {
  if (!room.parent_room_id) return room.name
  const parent = byId.get(room.parent_room_id)
  if (!parent) return room.name
  return `${parent.name} > ${room.name}`
}

// Collect the id set of all descendants of a given room.
function collectDescendants(roomId: string, allRooms: RoomEntry[]): Set<string> {
  const result = new Set<string>()
  function walk(parentId: string) {
    for (const r of allRooms) {
      if (r.parent_room_id === parentId) {
        result.add(r.id)
        walk(r.id)
      }
    }
  }
  walk(roomId)
  return result
}

export function MoveRoomDialog({
  roomId,
  roomName,
  currentParentId,
  allRooms,
  open,
  onClose,
}: MoveRoomDialogProps) {
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(currentParentId)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedId(currentParentId)
      setError(null)
    }
  }, [open, currentParentId])

  const byId = useMemo(() => new Map(allRooms.map((r) => [r.id, r])), [allRooms])

  const descendants = useMemo(
    () => collectDescendants(roomId, allRooms),
    [roomId, allRooms],
  )

  const candidates = useMemo(() => {
    return allRooms
      .filter((r) => r.id !== roomId && !descendants.has(r.id))
      .sort((a, b) => buildLabel(a, byId).localeCompare(buildLabel(b, byId)))
  }, [allRooms, roomId, descendants, byId])

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates
    const q = search.toLowerCase()
    return candidates.filter((r) => buildLabel(r, byId).toLowerCase().includes(q))
  }, [candidates, search, byId])

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await moveRoom(roomId, selectedId)
      if (!result.success) {
        setError(result.error ?? 'Move failed.')
        return
      }
      onClose()
    })
  }

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative flex flex-col gap-0 w-full max-w-sm max-h-[70vh] rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-lg overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <h2 className="font-heading text-base font-medium leading-none">Move &quot;{roomName}&quot;</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose a new location</p>
        </div>

        <div className="px-3 pt-3">
          <input
            type="text"
            placeholder="Search rooms..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 min-h-0">
          <li>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                selectedId === null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              Root (no parent)
            </button>
          </li>
          {filtered.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => setSelectedId(room.id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                  selectedId === room.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                {buildLabel(room, byId)}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
              No rooms found.
            </li>
          )}
        </ul>

        {error && <p className="px-5 text-xs text-destructive">{error}</p>}

        <div className="flex flex-col-reverse gap-2 px-5 py-4 border-t border-border sm:flex-row sm:justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Moving...' : 'Move here'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
