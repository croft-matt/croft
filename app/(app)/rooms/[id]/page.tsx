import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import {
  getRoomById,
  getChildRooms,
  getEmailIdsForRoom,
  getJobsForRoom,
  getContactsForRoom,
  getEmailsForRoom,
  getCrossReferences,
  getAllActiveRooms,
} from '@/lib/queries/rooms'
import { getRoomAssets } from '@/lib/rooms/assets'
import { getRoomPeople } from '@/lib/rooms/people'
import { assembleReadModel } from '@/lib/blocks/read-model'
import { RoomRealtimeProvider } from '@/components/room/room-realtime'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const room = await getRoomById(id)
  if (!room) notFound()

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  // Fetch email IDs once and share with jobs, assets, and emails queries to
  // avoid three redundant room_emails round-trips per page load.
  const emailIds = await getEmailIdsForRoom(id)

  const [parent, childRooms, jobs, roomAssetsData, roomPeopleData, contacts, emails, crossRefs, allRooms] =
    await Promise.all([
      room.parent_room_id ? getRoomById(room.parent_room_id) : Promise.resolve(null),
      getChildRooms(id),
      getJobsForRoom(id, emailIds),
      getRoomAssets({ workspaceId, roomId: id, emailIds }),
      getRoomPeople({ workspaceId, roomId: id, emailIds }),
      getContactsForRoom(id),
      getEmailsForRoom(id, 50, emailIds),
      getCrossReferences(id),
      getAllActiveRooms(workspaceId),
    ])

  // assembleReadModel fetches connected addresses. connectedAddresses is
  // passed to the client so it can re-resolve open loops live after Realtime updates.
  const readModel = await assembleReadModel(id, workspaceId, {
    room,
    jobs,
    assets: roomAssetsData.flat,
    contacts,
    emails,
  })

  return (
    <RoomRealtimeProvider
      workspaceId={workspaceId}
      initialRoom={room}
      initialChildRooms={childRooms}
      initialJobs={jobs}
      initialRoomAssets={roomAssetsData}
      initialRoomPeople={roomPeopleData}
      initialContacts={contacts}
      initialEmails={emails}
      initialCrossRefs={crossRefs}
      initialConnectedAddresses={readModel.connectedAddresses}
      initialTheirCourtByPerson={readModel.theirCourtByPerson ?? []}
      parent={parent ? { id: parent.id, name: parent.name } : null}
      initialAllRooms={allRooms}
    />
  )
}
