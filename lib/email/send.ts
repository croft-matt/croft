'use server'

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Resend } from 'resend'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRatelimit } from '@/lib/ratelimit'

const resend = new Resend(process.env.RESEND_API_KEY)

const SendEmailSchema = z.object({
  workspaceId: z.string().uuid(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
})

export type SendEmailParams = z.infer<typeof SendEmailSchema>

const PLAIN_FOOTER = '\n--\nSent via Croft · yourcroft.com'

const HTML_FOOTER =
  '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;font-family:sans-serif;">' +
  'Sent via <a href="https://yourcroft.com" style="color:#9ca3af;">Croft</a>' +
  '</div>'

export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  await requireUser()

  const parsed = SendEmailSchema.safeParse(params)
  if (!parsed.success) {
    throw new Error(`sendEmail: ${parsed.error.message}`)
  }

  const { workspaceId, to, cc, subject, bodyText, bodyHtml, inReplyTo, references } =
    parsed.data

  const { success } = await sendRatelimit.limit(workspaceId)
  if (!success) {
    throw new Error('sendEmail: rate limit exceeded (60 sends per hour)')
  }

  // Fetch workspace via RLS-scoped client — confirms the calling user has access.
  const supabase = await createClient()
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('croft_email_address')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.croft_email_address) {
    throw new Error('sendEmail: workspace has no croft_email_address configured')
  }

  // Fetch the connected Gmail address so replies land in a familiar inbox.
  // reply_to points to the user's Gmail address, not the Croft inbound address —
  // the existing forwarding rule handles getting replies back into Croft.
  const adminSupabase = createAdminClient()
  const { data: account } = await adminSupabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .limit(1)
    .maybeSingle()

  const finalText = bodyText + PLAIN_FOOTER
  const finalHtml = bodyHtml !== undefined ? bodyHtml + HTML_FOOTER : undefined

  const threadingHeaders: Record<string, string> = {}
  if (inReplyTo) threadingHeaders['In-Reply-To'] = inReplyTo
  if (references?.length) threadingHeaders['References'] = references.join(' ')

  const { data: sent, error } = await resend.emails.send({
    from: workspace.croft_email_address,
    to,
    ...(cc?.length ? { cc } : {}),
    subject,
    text: finalText,
    ...(finalHtml ? { html: finalHtml } : {}),
    ...(account?.email_address ? { reply_to: account.email_address } : {}),
    ...(Object.keys(threadingHeaders).length ? { headers: threadingHeaders } : {}),
  })

  if (error || !sent) {
    throw new Error(`sendEmail: Resend error: ${error?.message ?? 'unknown'}`)
  }

  // Store sent email as processed — no AI pipeline needed for outbound emails.
  // A generated Message-ID ensures the dedup constraint is satisfied.
  const messageId = `<${randomUUID()}@mail.yourcroft.com>`

  await adminSupabase.from('emails').insert({
    workspace_id: workspaceId,
    message_id: messageId,
    resend_email_id: sent.id,
    from_address: workspace.croft_email_address,
    to_addresses: to,
    cc_addresses: cc ?? [],
    subject,
    body_text: finalText,
    body_html: finalHtml ?? null,
    received_at: new Date().toISOString(),
    processing_state: 'processed',
    extraction_complete: true,
    attachments: [],
  })

  return { messageId: sent.id }
}
