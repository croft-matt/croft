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
import { resolveStack, resolveSuggestions } from '@/lib/blocks/registry'
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

  const [parent, childRooms, jobs, assets, contacts, emails, crossRefs, roomBlocks] =
    await Promise.all([
      room.parent_room_id ? getRoomById(room.parent_room_id) : Promise.resolve(null),
      getChildRooms(id),
      getJobsForRoom(id),
      getAssetsForRoom(id),
      getContactsForRoom(id),
      getEmailsForRoom(id, 50),
      getCrossReferences(id),
      getRoomBlocks(id),
    ])

  const readModel = await assembleReadModel(id, workspaceId, {
    room,
    jobs,
    assets,
    contacts,
    emails,
  })

  const initialStack = resolveStack(readModel, roomBlocks)
  const initialSuggestions = resolveSuggestions(readModel, roomBlocks)

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
      initialStack={initialStack}
      initialSuggestions={initialSuggestions}
      parent={parent ? { id: parent.id, name: parent.name } : null}
    />
  )
}
