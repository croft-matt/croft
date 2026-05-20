import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

// Fetches the full email body from Resend and updates the emails record.
// Called by the fetch-body Trigger.dev job after the webhook stores metadata.
export async function fetchAndStoreEmailBody(emailId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: email } = await supabase
    .from('emails')
    .select('id, resend_email_id')
    .eq('id', emailId)
    .single()

  if (!email?.resend_email_id) {
    throw new Error(`[fetch-body] email ${emailId} has no resend_email_id`)
  }

  const { data: received, error } = await resend.emails.get(email.resend_email_id) as {
    data: {
      text: string | null
      html: string | null
      headers: Record<string, string> | null
    } | null
    error: unknown
  }

  if (error || !received) {
    throw new Error(`[fetch-body] Resend API error for ${email.resend_email_id}: ${JSON.stringify(error)}`)
  }

  await supabase
    .from('emails')
    .update({
      body_text: received.text,
      body_html: received.html,
    })
    .eq('id', emailId)
}
