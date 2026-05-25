import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import {
  getRoomById,
  getChildRooms,
  getJobsForRoom,
  getAssetsForRoom,
  getContactsForRoom,
  getEmailsForRoom,
  getCrossReferences,
} from '@/lib/queries/rooms'
import { assembleReadModel, getRoomBlocks } from '@/lib/blocks/read-model'
import { RoomRealtimeProvider } from '@/components/room/room-realtime'

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

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  // Fetch email IDs once and share with jobs, assets, and emails queries to
  // avoid three redundant room_emails round-trips per page load.
  const emailIds = await getEmailIdsForRoom(id)

  const [parent, childRooms, jobs, assets, contacts, emails, crossRefs, roomBlocks] =
    await Promise.all([
      room.parent_room_id ? getRoomById(room.parent_room_id) : Promise.resolve(null),
      getChildRooms(id),
      getJobsForRoom(id, emailIds),
      getAssetsForRoom(id, emailIds),
      getContactsForRoom(id),
      getEmailsForRoom(id, 50, emailIds),
      getCrossReferences(id),
      getRoomBlocks(id),
    ])

  // assembleReadModel fetches connected addresses and builds the full read model.
  // connectedAddresses is passed to the client so it can re-resolve blocks live.
  const readModel = await assembleReadModel(id, workspaceId, {
    room,
    jobs,
    assets,
    contacts,
    emails,
  })

  return (
    <RoomRealtimeProvider
      workspaceId={workspaceId}
      defaultTab={activeTab}
      initialRoom={room}
      initialChildRooms={childRooms}
      initialJobs={jobs}
      initialAssets={assets}
      initialContacts={contacts}
      initialEmails={emails}
      initialCrossRefs={crossRefs}
      initialRoomBlocks={roomBlocks}
      initialConnectedAddresses={readModel.connectedAddresses}
      parent={parent ? { id: parent.id, name: parent.name } : null}
    />
  )
}
