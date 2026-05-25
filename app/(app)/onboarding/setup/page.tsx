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
    .select('id, forwarding_configured, history_imported')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle()

  if (!account) redirect('/onboarding')

  // If both stages are already done (e.g. user refreshed after completion),
  // send them straight to the processing gate.
  if (account.forwarding_configured && account.history_imported) {
    redirect('/onboarding/processing')
  }

  return (
    <SetupClient
      workspaceId={workspaceId}
      accountId={account.id}
      initialForwardingConfigured={account.forwarding_configured ?? false}
      initialHistoryImported={account.history_imported ?? false}
    />
  )
}
