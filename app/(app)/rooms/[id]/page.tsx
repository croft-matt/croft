import { notFound } from 'next/navigation'
import {
  getRoomById,
  getChildRooms,
  getJobsForRoom,
  getAssetsForRoom,
  getContactsForRoom,
  getEmailsForRoom,
  getCrossReferences,
} from '@/lib/queries/rooms'
import { RoomHeader } from '@/components/room/room-header'
import { CrossReferenceCards } from '@/components/room/cross-reference-cards'
import { OverdueAlert } from '@/components/room/overdue-alert'
import { RoomTabs } from '@/components/room/room-tabs'
import { OverviewTab } from '@/components/room/overview-tab'
import { AssetsTab } from '@/components/room/assets-tab'
import { ContactsTab } from '@/components/room/contacts-tab'
import { EmailsTab } from '@/components/room/emails-tab'

type ValidTab = 'overview' | 'assets' | 'contacts' | 'emails'
const VALID_TABS = new Set<string>(['overview', 'assets', 'contacts', 'emails'])

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabParam } = await searchParams
  const activeTab: ValidTab = VALID_TABS.has(tabParam ?? '') ? (tabParam as ValidTab) : 'overview'

  const room = await getRoomById(id)
  if (!room) notFound()

  const [parent, childRooms, jobs, assets, contacts, emails, crossRefs] = await Promise.all([
    room.parent_room_id ? getRoomById(room.parent_room_id) : Promise.resolve(null),
    getChildRooms(id),
    getJobsForRoom(id),
    getAssetsForRoom(id),
    getContactsForRoom(id),
    getEmailsForRoom(id, 50),
    getCrossReferences(id),
  ])

  const overdueJobs = jobs.filter((j) => j.status === 'open' && j.due && new Date(j.due) < new Date())
  const hasOverdue = overdueJobs.length > 0

  return (
    <div className="flex flex-col min-h-full">
      <RoomHeader
        room={room}
        parent={parent ? { id: parent.id, name: parent.name } : null}
        jobs={jobs}
        childRooms={childRooms}
      />

      <CrossReferenceCards crossRefs={crossRefs} />

      {hasOverdue && room.alert_text && (
        <OverdueAlert alertText={room.alert_text} />
      )}

      <RoomTabs
        defaultTab={activeTab}
        overview={<OverviewTab room={room} childRooms={childRooms} jobs={jobs} />}
        assets={<AssetsTab assets={assets} />}
        contacts={<ContactsTab contacts={contacts} />}
        emails={<EmailsTab emails={emails} roomId={id} />}
      />
    </div>
  )
}
