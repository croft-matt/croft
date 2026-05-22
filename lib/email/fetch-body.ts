import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveThreadId } from '@/lib/email/ingest'

const resend = new Resend(process.env.RESEND_API_KEY)

// Fetches the full email body from Resend, reads reply headers, and resolves thread_id.
// Called by the fetch-body Trigger.dev job after the webhook stores metadata.
export async function fetchAndStoreEmailBody(emailId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: email } = await supabase
    .from('emails')
    .select('id, resend_email_id, workspace_id, from_address, to_addresses, cc_addresses, subject')
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

  // Normalise header keys to lowercase for case-insensitive access.
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(received.headers ?? {})) {
    headers[k.toLowerCase()] = v
  }

  const inReplyTo = headers['in-reply-to'] ?? null
  const references = headers['references'] ?? null

  let threadId: string | null = null
  try {
    threadId = await resolveThreadId(email.workspace_id, {
      inReplyTo,
      references,
      providerThreadId: null,
      subject: email.subject,
      fromAddress: email.from_address,
      toAddresses: (email.to_addresses as string[]),
      ccAddresses: (email.cc_addresses as string[]),
    })
  } catch (err) {
    // Non-fatal: thread_id stays null and can be resolved by the backfill script.
    console.error(`[fetch-body] resolveThreadId failed for ${emailId}:`, err)
  }

  await supabase
    .from('emails')
    .update({
      body_text: received.text,
      body_html: received.html,
      in_reply_to: inReplyTo,
      email_references: references,
      ...(threadId !== null ? { thread_id: threadId } : {}),
    })
    .eq('id', emailId)
}
