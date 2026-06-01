'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import type { Room, Job } from '@/lib/types/database'
import { renameRoom, archiveRoom, updateRoomDescription } from '@/lib/rooms/actions'
import { MoveRoomDialog } from '@/components/room/move-room-dialog'
import { ConfirmDialog } from '@/components/room/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface RoomHeaderProps {
  room: Room
  parent: Pick<Room, 'id' | 'name'> | null
  jobs: Job[]
  childRooms?: Room[]
  allRooms: Array<{ id: string; name: string; parent_room_id: string | null }>
}

export function RoomHeader({ room, parent, jobs, childRooms, allRooms }: RoomHeaderProps) {
  const router = useRouter()
  const closedJobs = jobs.filter((j) => j.status === 'closed')
  const openJobs = jobs.filter((j) => j.status === 'open')
  const overdueJobs = openJobs.filter((j) => j.due && new Date(j.due) < new Date())

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(room.name)
  const [renamePending, startRenameTransition] = useTransition()
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Description edit state
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [descriptionValue, setDescriptionValue] = useState(room.description ?? '')
  const [descriptionPending, startDescriptionTransition] = useTransition()
  const descriptionInputRef = useRef<HTMLInputElement>(null)

  const [actionPending, startActionTransition] = useTransition()

  // Move dialog state
  const [isMoveOpen, setIsMoveOpen] = useState(false)

  // Archive confirm state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  // Focus rename input when entering rename mode.
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [isRenaming])

  // Focus description input when entering edit mode.
  useEffect(() => {
    if (isEditingDescription) {
      descriptionInputRef.current?.focus()
      descriptionInputRef.current?.select()
    }
  }, [isEditingDescription])

  function handleDescriptionConfirm() {
    const trimmed = descriptionValue.trim()
    if (trimmed === (room.description ?? '')) {
      setIsEditingDescription(false)
      return
    }
    startDescriptionTransition(async () => {
      await updateRoomDescription(room.id, trimmed || null)
      setIsEditingDescription(false)
    })
  }

  function handleDescriptionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleDescriptionConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDescriptionValue(room.description ?? '')
      setIsEditingDescription(false)
    }
  }

  // Keep rename value in sync if room prop changes (e.g. after revalidation).
  useEffect(() => {
    setRenameValue(room.name)
  }, [room.name])

  // Keep description value in sync if room prop changes.
  useEffect(() => {
    setDescriptionValue(room.description ?? '')
  }, [room.description])

  function handleRenameConfirm() {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === room.name) {
      setIsRenaming(false)
      setRenameValue(room.name)
      return
    }
    startRenameTransition(async () => {
      const result = await renameRoom(room.id, trimmed)
      if (!result.success) {
        setRenameValue(room.name)
      }
      setIsRenaming(false)
    })
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameConfirm()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsRenaming(false)
      setRenameValue(room.name)
    }
  }

  function handleArchive() {
    setIsConfirmOpen(true)
  }

  function handleArchiveConfirm() {
    startActionTransition(async () => {
      await archiveRoom(room.id)
      setIsConfirmOpen(false)
      router.push('/')
    })
  }

  return (
    <div className="border-b border-border px-6 pt-5 pb-3">
      {parent && (
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href={`/rooms/${parent.id}`} className="hover:text-foreground transition-colors">
            {parent.name}
          </Link>
          <span>/</span>
          <span className="text-muted-foreground">{renameValue}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameConfirm}
              onKeyDown={handleRenameKeyDown}
              disabled={renamePending}
              className="w-full text-lg font-medium text-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary disabled:opacity-50"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="text-lg font-medium text-foreground text-left hover:opacity-70 transition-opacity"
            >
              {renameValue}
            </button>
          )}
          <div className="mt-0.5">
            {isEditingDescription ? (
              <input
                ref={descriptionInputRef}
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value.slice(0, 120))}
                onBlur={handleDescriptionConfirm}
                onKeyDown={handleDescriptionKeyDown}
                disabled={descriptionPending}
                maxLength={120}
                className="w-full text-[13px] text-muted-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary disabled:opacity-50"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingDescription(true)}
                className="text-[13px] text-left transition-opacity hover:opacity-70"
                style={{ color: descriptionValue ? undefined : 'var(--muted-foreground)', opacity: descriptionValue ? undefined : 0.4 }}
              >
                {descriptionValue || 'Add a description'}
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {closedJobs.length > 0 && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {closedJobs.length} closed
            </span>
          )}
          {overdueJobs.length > 0 && (
            <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
              {overdueJobs.length} overdue
            </span>
          )}

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={actionPending}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
              aria-label="Room actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsMoveOpen(true)}>
                Move to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleArchive}>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MoveRoomDialog
        roomId={room.id}
        roomName={room.name}
        currentParentId={room.parent_room_id ?? null}
        allRooms={allRooms}
        open={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
      />

      <ConfirmDialog
        open={isConfirmOpen}
        title={`Archive "${room.name}"?`}
        description="This room will be hidden from your workspace. Any sub-rooms will move to the top level. You can recover it from the database if needed."
        confirmLabel="Archive"
        onConfirm={handleArchiveConfirm}
        onClose={() => setIsConfirmOpen(false)}
        isPending={actionPending}
      />
    </div>
  )
}
