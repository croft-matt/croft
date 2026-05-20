import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { importGmailHistoryTask } from './import-gmail-history'

export interface ConfigureGmailForwardingPayload {
  accountId: string
}

// Gmail's forwardingAddresses.create API is restricted to service accounts with
// domain-wide delegation — it cannot be called with user OAuth tokens. Forwarding
// is configured manually by the user (instructions shown in /settings/email).
// This job marks the account as ready and kicks off the history import immediately
// so email processing can begin while the user sets up forwarding.
export const configureGmailForwardingTask = task({
  id: 'configure-gmail-forwarding',
  maxDuration: 30,
  run: async (payload: ConfigureGmailForwardingPayload) => {
    const { accountId } = payload
    const supabase = createAdminClient()

    const { data: account } = await supabase
      .from('email_accounts')
      .select('workspace_id')
      .eq('id', accountId)
      .single()

    if (!account) throw new Error(`configure-gmail-forwarding: account ${accountId} not found`)

    await supabase
      .from('email_accounts')
      .update({ forwarding_configured: true })
      .eq('id', accountId)

    await importGmailHistoryTask.trigger({ accountId })

    return { accountId, forwarding_configured: true }
  },
})
