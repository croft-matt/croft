import { task } from '@trigger.dev/sdk/v3'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'

export interface ConfigureGmailForwardingPayload {
  accountId: string
}

export const configureGmailForwardingTask = task({
  id: 'configure-gmail-forwarding',
  maxDuration: 30,
  run: async (payload: ConfigureGmailForwardingPayload) => {
    const { accountId } = payload
    const supabase = createAdminClient()

    const { data: account } = await supabase
      .from('email_accounts')
      .select('workspace_id, email_address')
      .eq('id', accountId)
      .single()

    if (!account) throw new Error(`configure-gmail-forwarding: account ${accountId} not found`)

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('receiving_address, croft_email_address')
      .eq('id', account.workspace_id)
      .single()

    if (!workspace?.receiving_address) {
      throw new Error(`configure-gmail-forwarding: workspace has no receiving_address`)
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: workspace.croft_email_address ?? 'setup@mail.yourcroft.com',
      to: account.email_address,
      subject: 'One step to finish setting up Croft',
      text: buildSetupEmailText(workspace.receiving_address),
    })

    await broadcastToWorkspace(account.workspace_id, 'forwarding_setup_required', {
      receivingAddress: workspace.receiving_address,
    })

    return { accountId, emailSentTo: account.email_address }
  },
})

function buildSetupEmailText(receivingAddress: string): string {
  return [
    'You are almost set up. One manual step is needed: add your Croft address to Gmail forwarding.',
    '',
    'Your Croft address:',
    receivingAddress,
    '',
    'Steps:',
    '1. Open Gmail and go to Settings (gear icon) > See all settings',
    '2. Click the Forwarding and POP/IMAP tab',
    '3. Click Add a forwarding address and paste the address above',
    '4. Gmail will send a verification email to that address -- Croft confirms it automatically',
    '5. Select Forward a copy of incoming mail and save changes',
    '',
    'Once you add the address, Croft handles the rest.',
  ].join('\n')
}
