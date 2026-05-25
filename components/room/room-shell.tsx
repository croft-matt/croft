'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Room, Job } from '@/lib/types/database'
import type { RoomReadModel } from '@/lib/blocks/types'
import type { CrossReference } from '@/lib/queries/rooms'
import { RoomHeader } from '@/components/room/room-header'
import { CrossReferenceCards } from '@/components/room/cross-reference-cards'
import { OverdueAlert } from '@/components/room/overdue-alert'
import { EmailSidePanel } from '@/components/room/email-side-panel'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'

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
  parent: Pick<Room, 'id' | 'name'> | null
}

// Stub tab content components. Each will be replaced in Briefs 30 through 34.
function JobsTab({ readModel }: { readModel: RoomReadModel }) {
  void readModel
  return <div />
}

function DatesTab({ readModel }: { readModel: RoomReadModel }) {
  void readModel
  return <div />
}

function AssetsTab({ readModel }: { readModel: RoomReadModel }) {
  void readModel
  return <div />
}

function PeopleTab({ readModel }: { readModel: RoomReadModel }) {
  void readModel
  return <div />
}

function RecordTab({ readModel }: { readModel: RoomReadModel }) {
  void readModel
  return <div />
}

export function RoomShell({
  room,
  readModel,
  jobs,
  childRooms,
  crossRefs,
  parent,
}: RoomShellProps) {
  const [activeTab, setActiveTab] = useState<RoomTab>('jobs')
  const { emailId: panelEmailId } = useEmailSidePanel()
  const panelOpen = panelEmailId !== null

  const overdueJobs = jobs.filter(
    (j) => j.status === 'open' && j.due && new Date(j.due) < new Date(),
  )

  function renderTab() {
    switch (activeTab) {
      case 'jobs':
        return <JobsTab readModel={readModel} />
      case 'dates':
        return <DatesTab readModel={readModel} />
      case 'assets':
        return <AssetsTab readModel={readModel} />
      case 'people':
        return <PeopleTab readModel={readModel} />
      case 'record':
        return <RecordTab readModel={readModel} />
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Room content column: full width normally, 50% when side panel is open. */}
      <div
        className={cn(
          'flex flex-col min-h-full overflow-y-auto',
          panelOpen ? 'w-1/2' : 'w-full',
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

      {/* Side panel: renders alongside room content when an email citation is clicked. */}
      {panelOpen && <EmailSidePanel />}
    </div>
  )
}
