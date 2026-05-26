import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { getWaitingEmails, getOverdueJobs, getHotEmails } from '@/lib/queries/home'
import { getProcessingCount } from '@/lib/queries/cockpit'
import { HomeRealtime } from '@/components/home/home-realtime'

export default async function HomePage() {
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

  const [waiting, overdue, hot, counts] = await Promise.all([
    getWaitingEmails(workspaceId),
    getOverdueJobs(workspaceId),
    getHotEmails(workspaceId),
    getProcessingCount(workspaceId),
  ])

  return (
    <HomeRealtime
      workspaceId={workspaceId}
      workspaceName={workspace?.name ?? 'Croft'}
      initialWaiting={waiting}
      initialOverdue={overdue}
      initialHot={hot}
      initialProcessing={counts.processing}
      initialFailed={counts.failed}
    />
  )
}
