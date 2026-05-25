'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Room, Job } from '@/lib/types/database'
import type { RoomReadModel } from '@/lib/blocks/types'
import type { CrossReference } from '@/lib/queries/rooms'
import type { OwnerGroup } from '@/lib/jobs/open-loops'
import { RoomHeader } from '@/components/room/room-header'
import { CrossReferenceCards } from '@/components/room/cross-reference-cards'
import { OverdueAlert } from '@/components/room/overdue-alert'
import { EmailSidePanel } from '@/components/room/email-side-panel'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { JobsTab } from '@/components/room/jobs-tab'
import { DatesTab } from '@/components/room/dates-tab'
import { AssetsTab } from '@/components/room/assets-tab'
import { assembleDates } from '@/lib/rooms/dates'
import type { RoomAssets } from '@/lib/rooms/assets'
import type { RoomPeople } from '@/lib/rooms/people'
import { PeopleTab } from '@/components/room/people-tab'
import { RecordTab } from '@/components/room/record-tab'
import { assembleRecord } from '@/lib/rooms/record'

type RoomTab = 'jobs' | 'dates' | 'assets' | 'people' | 'record'

const TABS: { id: RoomTab; label: string }[] = [
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
}: RoomShellProps) {
  const [activeTab, setActiveTab] = useState<RoomTab>('jobs')
  const { isOpen } = useEmailSidePanel()
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

  const overdueJobs = jobs.filter(
    (j) => j.status === 'open' && j.due && new Date(j.due) < new Date(),
  )

  function renderTab() {
    switch (activeTab) {
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
        return <AssetsTab assets={roomAssets} />
      case 'people':
        return <PeopleTab people={roomPeople} />
      case 'record':
        return <RecordTab record={assembleRecord(readModel)} />
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Room content column: full width normally, 50% when side panel is open.
          On narrow viewports the column is hidden while the panel is open. */}
      <div
        className={cn(
          'flex flex-col min-h-full overflow-y-auto transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-1/2 w-0 overflow-hidden' : 'w-full',
        )}
      >
        <RoomHeader room={room} parent={parent} jobs={jobs} childRooms={childRooms} />

        <CrossReferenceCards crossRefs={crossRefs} />

        {overdueJobs.length > 0 && room.alert_text && (
          <OverdueAlert alertText={room.alert_text} />
        )}

        {/* Centered content column: AI summary above tabs, tabs below. */}
        <div className="flex-1 px-6 py-6">
          <div className="max-w-3xl mx-auto w-full">
            {room.room_summary && (
              <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
                {room.room_summary}
              </p>
            )}

            {/* Tab bar: five fixed tabs, always rendered. */}
            <div className="flex border-b border-border mb-6">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'mr-6 pb-3 pt-3 text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-b-2 border-foreground text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {renderTab()}
          </div>
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
