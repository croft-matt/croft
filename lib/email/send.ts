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
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.instanceof(Buffer),
      }),
    )
    .optional(),
  roomId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  source: z.enum(['user_reply', 'user_direct', 'user_cc']).optional(),
  attachedAssetIds: z.array(z.string().uuid()).optional(),
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

  const {
    workspaceId,
    to,
    cc,
    subject,
    bodyText,
    bodyHtml,
    inReplyTo,
    references,
    attachments,
    roomId,
    threadId,
    source,
    attachedAssetIds,
  } = parsed.data

  const { success } = await sendRatelimit.limit(workspaceId)
  if (!success) {
    throw new Error('sendEmail: rate limit exceeded (60 sends per hour)')
  }

  // Fetch workspace via RLS-scoped client so the caller's access is verified.
  // Also fetch receiving_address: replies to Croft-sent emails route back to
  // the inbound webhook, not to the user's Gmail address.
  const supabase = await createClient()
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('croft_email_address, receiving_address')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.croft_email_address) {
    throw new Error('sendEmail: workspace has no croft_email_address configured')
  }

  const adminSupabase = createAdminClient()

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
    ...(workspace.receiving_address ? { reply_to: workspace.receiving_address } : {}),
    ...(Object.keys(threadingHeaders).length ? { headers: threadingHeaders } : {}),
    ...(attachments?.length ? { attachments } : {}),
  })

  if (error || !sent) {
    throw new Error(`sendEmail: Resend error: ${error?.message ?? 'unknown'}`)
  }

  // Store the sent email as processed. A generated Message-ID satisfies the dedup constraint.
  // room_id and attached_asset_ids are new columns added in migration 20260526000006.
  // They will be typed properly once pnpm types:gen is run after the migration.
  const messageId = `<${randomUUID()}@mail.yourcroft.com>`

  const baseInsert = {
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
    ...(inReplyTo ? { in_reply_to: inReplyTo } : {}),
    ...(threadId ? { thread_id: threadId } : {}),
    ...(source ? { source } : {}),
  }

  // room_id and attached_asset_ids are spread separately until types:gen reflects
  // the migration adding them to the emails table.
  const extendedFields: Record<string, unknown> = {
    ...(roomId ? { room_id: roomId } : {}),
    ...(attachedAssetIds?.length ? { attached_asset_ids: attachedAssetIds } : {}),
  }

  await adminSupabase
    .from('emails')
    .insert({ ...baseInsert, ...extendedFields } as typeof baseInsert)

  return { messageId: sent.id }
}
