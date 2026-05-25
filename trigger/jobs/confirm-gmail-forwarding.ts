import { task } from '@trigger.dev/sdk/v3'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import { importGmailHistoryTask } from './import-gmail-history'

export interface ConfirmGmailForwardingPayload {
  emailId: string
  workspaceId: string
  resendEmailId: string
}

export const confirmGmailForwardingTask = task({
  id: 'confirm-gmail-forwarding',
  maxDuration: 60,
  run: async (payload: ConfirmGmailForwardingPayload) => {
    const { emailId, workspaceId, resendEmailId } = payload
    const supabase = createAdminClient()
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data: received, error: fetchError } = await resend.emails.receiving.get(resendEmailId)

    if (fetchError || !received) {
      throw new Error(
        `confirm-gmail-forwarding: body fetch failed: ${JSON.stringify(fetchError)}`,
      )
    }

    const emailText = received.text ?? received.html ?? ''
    const confirmationUrl = extractGmailConfirmationUrl(emailText)

    if (!confirmationUrl) {
      console.error(
        `confirm-gmail-forwarding: no confirmation URL found for email ${emailId}`,
        '\nBody preview:',
        emailText.slice(0, 500),
        '\nResend email ID:', resendEmailId,
      )
      throw new Error(`confirm-gmail-forwarding: confirmation URL not found`)
    }

    const confirmResponse = await fetch(confirmationUrl, {
      method: 'GET',
      redirect: 'follow',
    })

    if (!confirmResponse.ok && confirmResponse.status !== 302) {
      throw new Error(
        `confirm-gmail-forwarding: confirmation GET returned ${confirmResponse.status}`,
      )
    }

    // Mark the verification email as ignored so it does not appear in the cockpit.
    await supabase
      .from('emails')
      .update({ processing_state: 'ignored' })
      .eq('id', emailId)

    await supabase
      .from('email_accounts')
      .update({ forwarding_configured: true })
      .eq('workspace_id', workspaceId)
      .eq('provider', 'google')

    await broadcastToWorkspace(workspaceId, 'forwarding_configured', { workspaceId })

    const { data: account } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'google')
      .single()

    if (account) {
      await importGmailHistoryTask.trigger({ accountId: account.id })
    }

    return { workspaceId, confirmed: true, confirmationUrl }
  },
})

// Extracts a Gmail forwarding confirmation URL from the email body.
// Gmail verification emails contain the URL on its own line pointing to google.com.
// Patterns are ordered by specificity. The broad fallback is intentional:
// it is better to attempt an incorrect URL and fail cleanly than to miss the real one.
// If this throws in production, the 500-char body preview above will show the raw content.
function extractGmailConfirmationUrl(body: string): string | null {
  const patterns = [
    /https:\/\/mail-settings\.google\.com\/mail\/[^\s<"]+/,
    /https:\/\/mail\.google\.com\/mail\/[^\s<"]+/,
    /https:\/\/accounts\.google\.com\/[^\s<"]*[Cc]onfirm[^\s<"]*/,
    /https:\/\/[a-z.-]*google\.com\/[^\s<"]{30,}/,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) return match[0]
  }

  return null
}
