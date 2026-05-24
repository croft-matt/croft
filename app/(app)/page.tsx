import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import {
  getUrgentEmails,
  getEmailRoomNames,
  getOverdueJobs,
  getActiveRooms,
  getProcessingCount,
} from '@/lib/queries/cockpit'
import { CockpitRealtimeProvider } from '@/components/cockpit/cockpit-realtime'

export default async function CockpitPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()

  if (!workspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">No workspace found.</p>
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
    <CockpitRealtimeProvider
      workspaceId={workspaceId}
      workspaceName={workspace?.name ?? 'Croft'}
      initialUrgentEmails={urgentEmails}
      initialRoomNames={roomNames}
      initialOverdueJobs={overdueJobs}
      initialRooms={activeRooms}
      initialProcessing={counts.processing}
      initialFailed={counts.failed}
    />
  )
}
