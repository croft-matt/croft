import { task } from '@trigger.dev/sdk/v3'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { importGmailHistoryTask } from './import-gmail-history'

export interface ConfigureGmailForwardingPayload {
  accountId: string
}

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 60_000

export const configureGmailForwardingTask = task({
  id: 'configure-gmail-forwarding',
  maxDuration: 120,
  run: async (payload: ConfigureGmailForwardingPayload) => {
    const { accountId } = payload
    const supabase = createAdminClient()

    const { data: account } = await supabase
      .from('email_accounts')
      .select('workspace_id')
      .eq('id', accountId)
      .single()

    if (!account) throw new Error(`configure-gmail-forwarding: account ${accountId} not found`)

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('receiving_address')
      .eq('id', account.workspace_id)
      .single()

    if (!workspace?.receiving_address) {
      throw new Error(`configure-gmail-forwarding: workspace ${account.workspace_id} has no receiving_address`)
    }

    const accessToken = await getValidAccessToken(accountId)

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    auth.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth })

    // Step 1: register the forwarding address.
    // Google sends a verification email to receiving_address (our Resend inbound).
    const createResult = await gmail.users.settings.forwardingAddresses.create({
      userId: 'me',
      requestBody: { forwardingEmail: workspace.receiving_address },
    })

    // If Google already verified the address (e.g. same Workspace domain), skip polling.
    if (createResult.data.verificationStatus === 'accepted') {
      await createFilter(gmail, workspace.receiving_address)
      await supabase
        .from('email_accounts')
        .update({ forwarding_configured: true })
        .eq('id', accountId)
      await importGmailHistoryTask.trigger({ accountId })
      return { accountId, verified: true, method: 'auto' }
    }

    // Step 2: poll the emails table for Google's verification email.
    // It arrives at receiving_address via the Resend inbound webhook.
    const verificationEmail = await pollForVerificationEmail(
      supabase,
      account.workspace_id
    )

    if (!verificationEmail) {
      throw new Error(
        `configure-gmail-forwarding: verification email not received within ${POLL_TIMEOUT_MS / 1000}s`
      )
    }

    // Step 3: verify the forwarding address.
    // The Gmail API has no forwardingAddresses.verify method. Instead, Google's
    // confirmation email contains a link that, when fetched with a valid bearer
    // token, confirms the address. We extract that link and follow it.
    const confirmed = await followConfirmationLink(
      verificationEmail.body_text ?? '',
      accessToken
    )

    if (!confirmed) {
      throw new Error('configure-gmail-forwarding: could not follow confirmation link')
    }

    // Step 4: create a filter that forwards all incoming mail.
    await createFilter(gmail, workspace.receiving_address)

    await supabase
      .from('email_accounts')
      .update({ forwarding_configured: true })
      .eq('id', accountId)

    await importGmailHistoryTask.trigger({ accountId })

    return { accountId, verified: true, method: 'link' }
  },
})

async function pollForVerificationEmail(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<{ body_text: string | null } | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('emails')
      .select('body_text')
      .eq('workspace_id', workspaceId)
      .eq('from_address', 'mail-noreply@google.com')
      .ilike('subject', '%Gmail Forwarding Confirmation%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) return data

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return null
}

// Extracts the confirmation URL from Google's verification email body and
// fetches it with the user's access token. Returns true if the request succeeds.
async function followConfirmationLink(
  bodyText: string,
  accessToken: string
): Promise<boolean> {
  // Google's forwarding confirmation email contains a URL that verifies the address.
  // The link pattern varies but always contains a Google domain and a confirmation token.
  const urlMatch = bodyText.match(
    /https:\/\/(?:mail\.google\.com|accounts\.google\.com)\/[^\s"<>]+(?:confirm|verify|fwd)[^\s"<>]*/i
  )

  if (!urlMatch) return false

  const response = await fetch(urlMatch[0], {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  })

  return response.ok
}

async function createFilter(
  gmail: ReturnType<typeof google.gmail>,
  forwardingEmail: string
): Promise<void> {
  await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      // Empty criteria matches all incoming mail.
      criteria: {},
      action: { forward: forwardingEmail },
    },
  })
}
