'use client'

import { useEffect } from 'react'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  Pencil,
  Archive,
  Trash2,
  CornerDownRight,
  GitMerge,
  FileText,
  CheckSquare,
  Calendar,
  Paperclip,
  Users,
  Database,
  CheckCircle,
  BellOff,
  LayoutGrid,
  X,
  FolderOpen,
  Send,
  User,
  Upload,
} from 'lucide-react'
import type { OpenLoops, OpenLoop, OwnerGroup } from '@/lib/jobs/open-loops'
import type { CommandDefinition } from './registry'
import { registerCommands } from './registry'
import { BLOCK_REGISTRY } from '@/lib/blocks/registry'
import { useCommandPalette, type SubStep } from '@/stores/command-palette-store'
import { useNudgeModal } from '@/lib/command-palette/nudge-modal-store'
import { archiveRoom, removeRoom, moveRoom, mergeRoom } from '@/lib/rooms/actions'
import { snoozeJob } from '@/lib/jobs/actions'
import { acceptBlock, dismissBlock } from '@/lib/blocks/actions'
import { useJobModal } from '@/stores/job-modal-store'
import type { Job } from '@/lib/types/database'

interface UseRoomCommandsParams {
  room: { id: string; name: string; archived_at: string | null; status: string }
  openLoops: OpenLoops
  activeBlocks: string[]
  allRooms: Array<{ id: string; name: string }>
  router: AppRouterInstance
  workspaceId?: string
  ownerGroups?: OwnerGroup[]
}

function buildSnoozeDurationCommands(jobId: string): CommandDefinition[] {
  const { closePalette } = useCommandPalette.getState()
  const now = new Date()

  function addDays(days: number): Date {
    const d = new Date(now)
    d.setDate(d.getDate() + days)
    d.setHours(9, 0, 0, 0)
    return d
  }

  return [
    {
      id: `snooze-tomorrow-${jobId}`,
      group: 'jobs',
      label: 'Tomorrow',
      keywords: ['tomorrow', 'next day'],
      icon: BellOff,
      context: 'in-room',
      action: async () => {
        await snoozeJob(jobId, addDays(1))
        closePalette()
      },
    },
    {
      id: `snooze-3days-${jobId}`,
      group: 'jobs',
      label: 'In 3 days',
      keywords: ['3 days', 'three days'],
      icon: BellOff,
      context: 'in-room',
      action: async () => {
        await snoozeJob(jobId, addDays(3))
        closePalette()
      },
    },
    {
      id: `snooze-1week-${jobId}`,
      group: 'jobs',
      label: 'Next week',
      keywords: ['next week', 'one week', '7 days'],
      icon: BellOff,
      context: 'in-room',
      action: async () => {
        await snoozeJob(jobId, addDays(7))
        closePalette()
      },
    },
    {
      id: `snooze-2weeks-${jobId}`,
      group: 'jobs',
      label: 'In two weeks',
      keywords: ['two weeks', 'fortnight', '14 days'],
      icon: BellOff,
      context: 'in-room',
      action: async () => {
        await snoozeJob(jobId, addDays(14))
        closePalette()
      },
    },
  ]
}

function buildRoomCommands(params: UseRoomCommandsParams): CommandDefinition[] {
  const { room, openLoops, activeBlocks, allRooms, router, workspaceId, ownerGroups } = params
  const { closePalette, pushSubStep, triggerRenameRoom } = useCommandPalette.getState()
  const openJobModal = useJobModal.getState().open

  const commands: CommandDefinition[] = []

  // Tab navigation
  const tabs: Array<{ id: string; label: string; icon: typeof FileText; shortcut: string }> = [
    { id: 'brief', label: 'Go to Brief tab', icon: FileText, shortcut: '1' },
    { id: 'jobs', label: 'Go to Jobs tab', icon: CheckSquare, shortcut: '2' },
    { id: 'dates', label: 'Go to Dates tab', icon: Calendar, shortcut: '3' },
    { id: 'assets', label: 'Go to Assets tab', icon: Paperclip, shortcut: '4' },
    { id: 'people', label: 'Go to People tab', icon: Users, shortcut: '5' },
    { id: 'record', label: 'Go to Record tab', icon: Database, shortcut: '6' },
  ]

  for (const tab of tabs) {
    commands.push({
      id: `tab-${tab.id}-${room.id}`,
      group: 'navigate',
      label: tab.label,
      keywords: [tab.id, 'tab'],
      icon: tab.icon,
      shortcut: tab.shortcut,
      context: 'in-room',
      action: () => {
        closePalette()
        // Tab switching is handled via a custom event that RoomShell listens to.
        window.dispatchEvent(new CustomEvent('croft:switch-tab', { detail: { tab: tab.id, roomId: room.id } }))
      },
    })
  }

  // Rename
  commands.push({
    id: `room-rename-${room.id}`,
    group: 'rooms',
    label: 'Rename this room',
    keywords: ['rename', 'name', 'change name'],
    icon: Pencil,
    context: 'in-room',
    action: () => {
      closePalette()
      triggerRenameRoom(room.id)
    },
  })

  // Archive (only if not already archived)
  if (!room.archived_at) {
    commands.push({
      id: `room-archive-${room.id}`,
      group: 'rooms',
      label: 'Archive this room',
      keywords: ['archive', 'close', 'done', 'complete', 'finish'],
      icon: Archive,
      context: 'in-room',
      action: async () => {
        await archiveRoom(room.id)
        closePalette()
        router.push('/')
      },
    })
  }

  // Remove (only if not already deleted)
  if (room.status !== 'deleted') {
    commands.push({
      id: `room-remove-${room.id}`,
      group: 'rooms',
      label: 'Remove this room',
      keywords: ['remove', 'delete', 'mistake', 'not a room', 'wrong'],
      icon: Trash2,
      context: 'in-room',
      action: () => {
        const confirmStep: SubStep = {
          prompt: 'Type "remove" to confirm, or press Escape to cancel',
          commands: [
            {
              id: 'room-remove-confirm',
              group: 'rooms',
              label: `Remove "${room.name}"`,
              keywords: ['remove', 'confirm', 'yes'],
              icon: Trash2,
              context: 'in-room',
              action: async () => {
                await removeRoom(room.id)
                closePalette()
                router.push('/')
              },
            },
          ],
        }
        pushSubStep(confirmStep)
      },
    })
  }

  // Move
  commands.push({
    id: `room-move-${room.id}`,
    group: 'rooms',
    label: 'Move this room',
    keywords: ['move', 'parent', 'nest', 'under', 'reorganise'],
    icon: CornerDownRight,
    context: 'in-room',
    action: () => {
      const candidates: CommandDefinition[] = allRooms
        .filter((r) => r.id !== room.id)
        .map((r) => ({
          id: `move-to-${r.id}`,
          group: 'rooms' as const,
          label: r.name,
          keywords: ['move', 'parent'],
          icon: FolderOpen,
          context: 'in-room' as const,
          action: async () => {
            await moveRoom(room.id, r.id)
            closePalette()
          },
        }))
      pushSubStep({ prompt: 'Move under which room?', commands: candidates })
    },
  })

  // Merge
  commands.push({
    id: `room-merge-${room.id}`,
    group: 'rooms',
    label: 'Merge this room into another',
    keywords: ['merge', 'combine', 'duplicate', 'same project'],
    icon: GitMerge,
    context: 'in-room',
    action: () => {
      const candidates: CommandDefinition[] = allRooms
        .filter((r) => r.id !== room.id)
        .map((r) => ({
          id: `merge-into-${r.id}`,
          group: 'rooms' as const,
          label: `Merge into "${r.name}"`,
          keywords: ['merge', 'combine'],
          icon: GitMerge,
          context: 'in-room' as const,
          action: async () => {
            await mergeRoom(room.id, r.id)
            closePalette()
            router.push(`/rooms/${r.id}`)
          },
        }))
      pushSubStep({ prompt: 'Merge into which room?', commands: candidates })
    },
  })

  // Mark a job done (only if there are your-court jobs)
  if (openLoops.yourCourt.length > 0) {
    commands.push({
      id: `job-done-${room.id}`,
      group: 'jobs',
      label: 'Mark a job done',
      keywords: ['done', 'complete', 'finish', 'close', 'resolve'],
      icon: CheckCircle,
      context: 'in-room',
      action: () => {
        const candidates: CommandDefinition[] = openLoops.yourCourt.map((loop: OpenLoop) => ({
          id: `mark-done-${loop.id}`,
          group: 'jobs' as const,
          label: loop.description,
          keywords: ['done', 'complete'],
          icon: CheckCircle,
          context: 'in-room' as const,
          action: () => {
            closePalette()
            openJobModal(loop.id)
          },
        }))
        pushSubStep({ prompt: 'Which job is done?', commands: candidates })
      },
    })

    // Snooze a job (only if there are your-court jobs)
    commands.push({
      id: `job-snooze-${room.id}`,
      group: 'jobs',
      label: 'Snooze a job',
      keywords: ['snooze', 'defer', 'later', 'remind', 'delay'],
      icon: BellOff,
      context: 'in-room',
      action: () => {
        const jobCandidates: CommandDefinition[] = openLoops.yourCourt.map((loop: OpenLoop) => ({
          id: `snooze-pick-${loop.id}`,
          group: 'jobs' as const,
          label: loop.description,
          keywords: ['snooze'],
          icon: BellOff,
          context: 'in-room' as const,
          action: () => {
            pushSubStep({
              prompt: 'Snooze for how long?',
              commands: buildSnoozeDurationCommands(loop.id),
            })
          },
        }))
        pushSubStep({ prompt: 'Snooze which job?', commands: jobCandidates })
      },
    })
  }

  // Nudge someone on outstanding items (only when there are awaiting-others loops)
  const nudgeGroups = ownerGroups?.filter(g => g.personKey !== '__unassigned__' && g.loops.length > 0) ?? []
  if (nudgeGroups.length > 0 && workspaceId) {
    commands.push({
      id: `nudge-${room.id}`,
      group: 'intelligence',
      label: 'Nudge someone on outstanding items',
      keywords: ['nudge', 'chase', 'follow up', 'remind', 'outstanding', 'waiting'],
      icon: Send,
      context: 'in-room',
      action: () => {
        const { openNudgeModal } = useNudgeModal.getState()
        const candidates: CommandDefinition[] = nudgeGroups.map(group => ({
          id: `nudge-person-${group.personKey}`,
          group: 'intelligence' as const,
          label: group.name ?? group.displayAddress ?? group.personKey,
          keywords: ['nudge', group.displayAddress ?? group.personKey],
          icon: User,
          context: 'in-room' as const,
          action: () => {
            closePalette()
            openNudgeModal({
              group,
              roomId: room.id,
              roomName: room.name,
              workspaceId: workspaceId!,
            })
          },
        }))
        pushSubStep({ prompt: 'Nudge who?', commands: candidates })
      },
    })
  }

  // Upload file: dispatches an event that the room shell's listener picks up.
  // The room shell holds the file picker so the user gesture requirement is met.
  commands.push({
    id: `room-upload-file-${room.id}`,
    group: 'rooms',
    label: 'Upload file to room',
    keywords: ['upload', 'file', 'attach', 'add file', 'import'],
    icon: Upload,
    context: 'in-room',
    action: () => {
      closePalette()
      window.dispatchEvent(new Event('croft:open-upload-picker'))
    },
  })

  // Add a block (always show; sub-step filters to non-active blocks)
  commands.push({
    id: `block-add-${room.id}`,
    group: 'blocks',
    label: 'Add a block to this room',
    keywords: ['add', 'block', 'insert', 'enable', 'activate'],
    icon: LayoutGrid,
    context: 'in-room',
    action: () => {
      const available: CommandDefinition[] = BLOCK_REGISTRY
        .filter((b) => !activeBlocks.includes(b.type))
        .map((b) => ({
          id: `block-add-${b.type}`,
          group: 'blocks' as const,
          label: `Add ${b.title} block`,
          keywords: ['block', 'add', b.type],
          icon: LayoutGrid,
          context: 'in-room' as const,
          action: async () => {
            await acceptBlock(room.id, b.type)
            closePalette()
          },
        }))
      pushSubStep({ prompt: 'Add which block?', commands: available })
    },
  })

  // Remove a block (only if active blocks exist)
  if (activeBlocks.length > 0) {
    commands.push({
      id: `block-remove-${room.id}`,
      group: 'blocks',
      label: 'Remove a block from this room',
      keywords: ['remove', 'block', 'hide', 'disable', 'dismiss'],
      icon: X,
      context: 'in-room',
      action: () => {
        const active: CommandDefinition[] = BLOCK_REGISTRY
          .filter((b) => activeBlocks.includes(b.type))
          .map((b) => ({
            id: `block-remove-${b.type}`,
            group: 'blocks' as const,
            label: `Remove ${b.title} block`,
            keywords: ['block', 'remove', b.type],
            icon: X,
            context: 'in-room' as const,
            action: async () => {
              await dismissBlock(room.id, b.type)
              closePalette()
            },
          }))
        pushSubStep({ prompt: 'Remove which block?', commands: active })
      },
    })
  }

  return commands
}

export function useRoomCommands(params: UseRoomCommandsParams): void {
  const { room, openLoops, activeBlocks, ownerGroups } = params

  useEffect(() => {
    const commands = buildRoomCommands(params)
    const cleanup = registerCommands(commands)
    return cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, openLoops, activeBlocks, ownerGroups])
}
