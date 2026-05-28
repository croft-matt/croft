'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRoomUpload } from '@/hooks/use-room-upload'
import type { Room, Job } from '@/lib/types/database'
import type { RoomReadModel } from '@/lib/blocks/types'
import type { CrossReference } from '@/lib/queries/rooms'
import type { OwnerGroup } from '@/lib/jobs/open-loops'
import { RoomHeader } from '@/components/room/room-header'
import { CrossReferenceCards } from '@/components/room/cross-reference-cards'
import { useCommandPalette } from '@/stores/command-palette-store'
import { useRoomCommands } from '@/lib/command-palette/use-room-commands'
import { BriefTab } from '@/components/room/brief-tab'
import { JobsTab } from '@/components/room/jobs-tab'
import { DatesTab } from '@/components/room/dates-tab'
import { AssetsTab } from '@/components/room/assets-tab'
import { assembleBrief } from '@/lib/rooms/brief'
import { assembleDates } from '@/lib/rooms/dates'
import type { RoomAssets } from '@/lib/rooms/assets'
import type { RoomPeople } from '@/lib/rooms/people'
import { PeopleTab } from '@/components/room/people-tab'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { RecordTab } from '@/components/room/record-tab'
import { assembleRecord } from '@/lib/rooms/record'

type RoomTab = 'brief' | 'jobs' | 'dates' | 'assets' | 'people' | 'record'

const TABS: { id: RoomTab; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'dates', label: 'Dates' },
  { id: 'assets', label: 'Assets' },
  { id: 'people', label: 'People' },
  { id: 'record', label: 'Record' },
]

interface RoomShellProps {
  room: Room
  readModel: RoomReadModel
  jobs: Job[]
  childRooms: Room[]
  crossRefs: CrossReference[]
  ownerGroups: OwnerGroup[]
  parent: Pick<Room, 'id' | 'name'> | null
  roomAssets: RoomAssets
  roomPeople: RoomPeople
  allRooms: Array<{ id: string; name: string; parent_room_id: string | null }>
  workspaceId: string
}

export function RoomShell({
  room,
  readModel,
  jobs,
  childRooms,
  crossRefs,
  ownerGroups,
  parent,
  roomAssets,
  roomPeople,
  allRooms,
  workspaceId,
}: RoomShellProps) {
  const [activeTab, setActiveTab] = useState<RoomTab>('brief')
  const { isOpen: isEmailPanelOpen, open: openEmailPanel } = useEmailSidePanel()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const tabStyle = useMemo(() => ({
    active: {
      boxShadow: isDark
        ? '0px 0px 0px 0.5px rgba(255, 255, 255, 0.16)'
        : '0px 0px 0px 0.5px rgba(0, 0, 0, 0.12)',
    },
    inactive: {
      boxShadow: isDark
        ? '0px 1px 1px rgba(0, 0, 0, 0.08), 0px 4px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 0.5px rgba(255, 255, 255, 0.14)'
        : '0px 1px 1px rgba(0, 0, 0, 0.05), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.08)',
    },
  }), [isDark])

  // Read ?tab= from the URL on mount so cross-room views can link directly to a tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab') as RoomTab | null
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab)
    }
  }, [])

  // Read ?email= from the URL on mount and auto-open the side panel.
  // This lets the activity feed link directly to a room with the relevant email open.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const emailId = params.get('email')
    if (emailId) {
      setActiveTab('jobs')
      const panelTab = params.get('panel_tab')
      openEmailPanel(emailId, panelTab === 'email' ? 'email' : 'jobs')
    }
  // openEmailPanel is a stable Zustand action
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const { upload, openPicker } = useRoomUpload(room.id)

  // Set palette context and room ID while this room shell is mounted.
  useEffect(() => {
    useCommandPalette.setState({ context: 'in-room', currentRoomId: room.id })
    return () => {
      useCommandPalette.setState({ context: 'always', currentRoomId: null })
    }
  // room.id is stable for the lifetime of a room shell mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id])

  // Listen for the upload picker event dispatched by the command palette.
  useEffect(() => {
    const handler = () => openPicker()
    window.addEventListener('croft:open-upload-picker', handler)
    return () => window.removeEventListener('croft:open-upload-picker', handler)
  }, [openPicker])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current += 1
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounter.current -= 1
    if (dragCounter.current === 0) setDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setDragging(false)
      if (e.dataTransfer.files.length) {
        upload(e.dataTransfer.files)
      }
    },
    [upload]
  )

  // Listen for tab-switch events dispatched by command palette tab commands.
  useEffect(() => {
    function handleTabSwitch(e: Event) {
      const detail = (e as CustomEvent<{ tab: string; roomId: string }>).detail
      if (detail.roomId === room.id && TABS.some((t) => t.id === detail.tab)) {
        setActiveTab(detail.tab as RoomTab)
      }
    }
    window.addEventListener('croft:switch-tab', handleTabSwitch)
    return () => window.removeEventListener('croft:switch-tab', handleTabSwitch)
  }, [room.id])

  // Register room-level command palette commands.
  // activeBlocks defaults to [] since block rows are not yet passed through
  // the realtime provider. Block add/remove commands still work; "Remove a block"
  // is hidden when activeBlocks is empty, which is safe.
  useRoomCommands({
    room: {
      id: room.id,
      name: room.name,
      archived_at: room.archived_at ?? null,
      status: room.status,
    },
    openLoops: readModel.openLoops,
    activeBlocks: [],
    allRooms,
    router,
    workspaceId,
    ownerGroups,
  })

  const overdueJobs = jobs.filter(
    (j) => j.status === 'open' && j.due && new Date(j.due) < new Date(),
  )
  // Suppress unused variable warning. overdueJobs is passed to RoomHeader downstream.
  void overdueJobs

  function renderTab() {
    switch (activeTab) {
      case 'brief': {
        const roomDates = assembleDates(readModel)
        const brief = assembleBrief({
          openLoops: readModel.openLoops,
          ownerGroups,
          roomDates,
        })
        return <BriefTab brief={brief} workspaceId={readModel.workspaceId} parentName={parent?.name ?? null} roomSummary={room.room_summary ?? null} />
      }
      case 'jobs': {
        const closedJobs = readModel.jobs.filter((j) => j.status === 'closed')
        return (
          <JobsTab
            loops={readModel.openLoops}
            connectedAddresses={readModel.connectedAddresses}
            workspaceId={readModel.workspaceId}
            closedJobs={closedJobs}
          />
        )
      }
      case 'dates':
        return <DatesTab roomDates={assembleDates(readModel)} />
      case 'assets':
        return <AssetsTab assets={roomAssets} roomId={room.id} />
      case 'people': {
        const introduceJobs = jobs.filter((j) => j.intent === 'INTRODUCE')
        return <PeopleTab people={roomPeople} introduceJobs={introduceJobs} />
      }
      case 'record':
        return <RecordTab record={assembleRecord(readModel)} />
    }
  }

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">Drop files to upload to this room</p>
          </div>
        </div>
      )}
      <div className="flex flex-col min-h-full w-full">
        <RoomHeader room={room} parent={parent} jobs={jobs} childRooms={childRooms} allRooms={allRooms} />

        <CrossReferenceCards crossRefs={crossRefs} />

        {/* Tab bar: full width, flush under header */}
        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'h-[27px] px-[10px] text-xs font-medium rounded-full transition-colors inline-flex items-center cursor-pointer',
                activeTab === tab.id
                  ? 'dark:bg-[#202021] bg-secondary dark:text-white text-foreground'
                  : 'dark:bg-[#141415] bg-muted dark:text-[#949496] text-muted-foreground dark:hover:text-white hover:text-foreground',
              )}
              style={activeTab === tab.id ? tabStyle.active : tabStyle.inactive}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Centered content column.
            The Brief tab manages its own max-width and centering internally.
            All other tabs use the wider max-w-3xl container.
            Dims when the email side panel is open so focus stays on the panel. */}
        <div
          className={cn(
            'flex-1 px-6 py-6 transition-opacity ease-out',
            isEmailPanelOpen ? 'opacity-50 duration-[120ms]' : 'opacity-100 duration-[120ms]',
          )}
        >
          {activeTab === 'brief' ? (
            renderTab()
          ) : (
            <div className="max-w-3xl mx-auto w-full">
              {room.room_summary && (
                <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                  {room.room_summary}
                </p>
              )}
              {renderTab()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
