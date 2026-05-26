'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { EmailSidePanel } from '@/components/room/email-side-panel'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
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

  // Read ?tab= from the URL on mount so cross-room views can link directly to a tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab') as RoomTab | null
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab)
    }
  }, [])

  const { isOpen } = useEmailSidePanel()
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const { upload, openPicker } = useRoomUpload(room.id)
  // showPanel stays true for 200ms after isOpen goes false so the exit
  // animation completes before the panel is removed from the DOM.
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShowPanel(true)
    } else {
      const timer = setTimeout(() => setShowPanel(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

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
          roomStatus: room.room_status ?? null,
        })
        return <BriefTab brief={brief} workspaceId={readModel.workspaceId} parentName={parent?.name ?? null} roomSummary={room.room_summary ?? null} />
      }
      case 'jobs':
        return (
          <JobsTab
            loops={readModel.openLoops}
            ownerGroups={ownerGroups}
            workspaceId={readModel.workspaceId}
          />
        )
      case 'dates':
        return <DatesTab roomDates={assembleDates(readModel)} />
      case 'assets':
        return <AssetsTab assets={roomAssets} roomId={room.id} />
      case 'people':
        return <PeopleTab people={roomPeople} />
      case 'record':
        return <RecordTab record={assembleRecord(readModel)} />
    }
  }

  return (
    <div
      className="flex flex-1 overflow-hidden relative"
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
      {/* Room content column: full width normally, 50% when side panel is open.
          On narrow viewports the column is hidden while the panel is open. */}
      <div
        className={cn(
          'flex flex-col min-h-full overflow-y-auto transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-1/2 w-0 overflow-hidden' : 'w-full',
        )}
      >
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
                  ? 'bg-[#202021] text-white'
                  : 'bg-[#141415] text-[#949496] hover:text-white',
              )}
              style={
                activeTab === tab.id
                  ? { boxShadow: '0px 0px 0px 0.5px rgba(255, 255, 255, 0.16)' }
                  : { boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.08), 0px 4px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 0.5px rgba(255, 255, 255, 0.14)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Centered content column.
            The Brief tab manages its own max-width and centering internally.
            All other tabs use the wider max-w-3xl container. */}
        <div className={cn('flex-1 px-6', activeTab === 'brief' ? 'py-6' : 'py-6')}>
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

      {/* Side panel: slides in from the right when an email citation is clicked.
          Kept in the DOM for 200ms after close so the exit animation plays.
          Outer div transitions width (acts as a clip so translate stays meaningful).
          Inner div translates independently so the slide-in effect is clean. */}
      {showPanel && (
        <div
          className={cn(
            'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
            isOpen ? 'lg:w-1/2 w-full' : 'w-0',
          )}
        >
          <div
            className={cn(
              'h-full transition-transform duration-200 ease-out',
              isOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <EmailSidePanel />
          </div>
        </div>
      )}
    </div>
  )
}
