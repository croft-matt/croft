import { redirect } from 'next/navigation'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { SetupClient } from './setup-client'

export default async function OnboardingSetupPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) redirect('/onboarding')

  const supabase = await createClient()

  const { data: account } = await supabase
    .from('email_accounts')
    .select('history_imported')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle()

  if (!account) redirect('/onboarding')

  // If the import already completed, send directly to the processing screen.
  if (account.history_imported) {
    redirect('/onboarding/processing')
  }

  return <SetupClient workspaceId={workspaceId} />
}
