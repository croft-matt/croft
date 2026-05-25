import { redirect } from 'next/navigation'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ProcessingClient } from './processing-client'

export default async function OnboardingProcessingPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) redirect('/onboarding')

  const supabase = await createClient()

  // Check if onboarding already completed (e.g. user navigated back after finishing).
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('onboarding_complete')
    .eq('id', workspaceId)
    .single()

  if (workspace?.onboarding_complete) {
    redirect('/')
  }

  // Restore progress counts from the database so a page refresh shows real state.
  // These are the initial values; Realtime events update them incrementally.
  const [
    { count: totalImported },
    { count: totalFiltered },
    { count: totalClassified },
    { count: totalRooms },
  ] = await Promise.all([
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .neq('processing_state', 'ignored')
      .neq('processing_state', 'received'),
    supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .in('processing_state', ['processed', 'failed']),
    supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
  ])

  return (
    <ProcessingClient
      workspaceId={workspaceId}
      initialImportTotal={totalImported ?? 0}
      initialImportN={totalImported ?? 0}
      initialFilterN={totalFiltered ?? 0}
      initialClassifyN={totalClassified ?? 0}
      initialRooms={totalRooms ?? 0}
    />
  )
}
