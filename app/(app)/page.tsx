import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import {
  getUrgentEmails,
  getEmailRoomNames,
  getOverdueJobs,
  getActiveRooms,
  getProcessingCount,
} from '@/lib/queries/cockpit'
import { TopBar } from '@/components/cockpit/top-bar'
import { UrgentList } from '@/components/cockpit/urgent-list'
import { OverdueList } from '@/components/cockpit/overdue-list'
import { RoomCard } from '@/components/cockpit/room-card'

export default async function CockpitPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()

  if (!workspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">No workspace found.</p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single()

  const [urgentEmails, overdueJobs, activeRooms, counts] = await Promise.all([
    getUrgentEmails(workspaceId),
    getOverdueJobs(workspaceId),
    getActiveRooms(workspaceId),
    getProcessingCount(workspaceId),
  ])

  const roomNames = await getEmailRoomNames(urgentEmails.map((e) => e.id))

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        workspaceName={workspace?.name ?? 'Croft'}
        processing={counts.processing}
        failed={counts.failed}
      />

      <div className="flex flex-1 gap-6 p-6">
        {/* Left column: urgent + overdue */}
        <div className="w-[42%] shrink-0 space-y-6">
          <div>
            <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
              Urgent
            </p>
            <UrgentList emails={urgentEmails} roomNames={roomNames} />
          </div>
          <OverdueList jobs={overdueJobs} />
        </div>

        {/* Right column: rooms */}
        <div className="flex-1 min-w-0">
          <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Rooms
          </p>
          {activeRooms.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-5">
              <p className="text-sm text-neutral-600">
                No rooms yet. Rooms are created when emails arrive or you create one manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {activeRooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
