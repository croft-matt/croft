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
    .select('forwarding_configured')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle()

  if (!account) redirect('/onboarding')

  // If forwarding is already confirmed, import has been triggered.
  // The processing screen is the right destination.
  if (account.forwarding_configured) {
    redirect('/onboarding/processing')
  }

  // Fetch the workspace receiving address. If the configure-gmail-forwarding
  // job already ran and broadcast before this page loaded (race condition),
  // the address will already be in the DB — pass it as an initial prop so
  // the client starts in the instructions stage immediately rather than
  // waiting for a broadcast that has already fired.
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('receiving_address')
    .eq('id', workspaceId)
    .single()

  return (
    <SetupClient
      workspaceId={workspaceId}
      initialReceivingAddress={workspace?.receiving_address ?? null}
    />
  )
}
