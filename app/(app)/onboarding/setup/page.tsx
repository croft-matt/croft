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

  return <SetupClient workspaceId={workspaceId} />
}
