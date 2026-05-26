// Sends a plain-text confirmation reply to the workspace user after a command executes.
// Not a server action -- called from Trigger.dev jobs.
// Does NOT insert an email row; confirmation is operational feedback, not project data.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface ConfirmationParams {
  workspaceId: string
  to: string         // Matt's gmail address (from email.from_address)
  subject: string    // "Re: [original subject]"
  body: string       // One-line confirmation or error message
  inReplyTo?: string // email.message_id for Gmail threading
}

export async function sendConfirmation(params: ConfirmationParams): Promise<void> {
  const { workspaceId, to, subject, body, inReplyTo } = params

  const supabase = createAdminClient()

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('croft_email_address')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.croft_email_address) {
    throw new Error('[confirmation] workspace has no croft_email_address configured')
  }

  const headers: Record<string, string> = {}
  if (inReplyTo) {
    headers['In-Reply-To'] = inReplyTo
    headers['References'] = inReplyTo
  }

  const { error } = await resend.emails.send({
    from: workspace.croft_email_address,
    to: [to],
    reply_to: to,
    subject,
    text: body,
    ...(Object.keys(headers).length ? { headers } : {}),
  })

  if (error) {
    throw new Error(`[confirmation] Resend error: ${error.message}`)
  }
}
