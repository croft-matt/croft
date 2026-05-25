'use server'

import { tasks } from '@trigger.dev/sdk/v3'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Re-enqueues configure-gmail-forwarding for the given account.
// Called from the setup screen when forwarding fails.
// Does not restart OAuth — tokens are still valid, only forwarding failed.
export async function retryForwarding(accountId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify the account belongs to this user's workspace.
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return

  const { data: account } = await supabase
    .from('email_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('workspace_id', membership.workspace_id)
    .maybeSingle()

  if (!account) return

  await tasks.trigger('configure-gmail-forwarding', { accountId })
}
