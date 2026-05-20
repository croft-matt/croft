import { createAdminClient } from '@/lib/supabase/admin'
import type { ResendInboundEvent } from '@/lib/validators/email-inbound'
import type { AttachmentMeta } from '@/lib/types/database'

export interface GmailMessageData {
  workspaceId: string
  messageId: string
  from: string
  toAddresses: string[]
  ccAddresses: string[]
  subject: string | null
  bodyText: string | null
  receivedAt: string
}

// Parses "Display Name <email@example.com>" or "email@example.com" into parts.
function parseFromAddress(from: string): { name: string | null; address: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/)
  if (match) {
    return { name: match[1].trim(), address: match[2].trim().toLowerCase() }
  }
  return { name: null, address: from.trim().toLowerCase() }
}

export interface IngestResult {
  emailId: string
  workspaceId: string
}

export async function storeEmailMetadata(
  data: ResendInboundEvent['data']
): Promise<IngestResult | null> {
  const supabase = createAdminClient()

  // Find the workspace whose receiving_address matches one of the `to` addresses.
  // The `to` array may include the workspace inbound address and forwarded recipients.
  const toAddresses = data.to.map((a) => a.toLowerCase())

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .in('receiving_address', toAddresses)
    .eq('active', true)
    .maybeSingle()

  if (!workspace) {
    // No workspace found for this receiving address. Log and drop gracefully.
    console.warn('[ingest] no workspace found for to addresses:', toAddresses)
    return null
  }

  const { name: fromName, address: fromAddress } = parseFromAddress(data.from)

  const attachments: AttachmentMeta[] = data.attachments.map((a) => ({
    filename: a.filename ?? 'untitled',
    size: 0,
    mime_type: a.content_type,
  }))

  const { data: email, error } = await supabase
    .from('emails')
    .insert({
      workspace_id: workspace.id,
      message_id: data.message_id,
      resend_email_id: data.email_id,
      from_address: fromAddress,
      from_name: fromName,
      to_addresses: data.to,
      cc_addresses: data.cc,
      subject: data.subject,
      received_at: data.created_at,
      processing_state: 'received',
      attachments,
    })
    .select('id')
    .single()

  if (error) {
    // unique(workspace_id, message_id) violation means a duplicate — safe to ignore.
    if (error.code === '23505') {
      console.info('[ingest] duplicate email skipped:', data.message_id)
      return null
    }
    throw new Error(`[ingest] failed to store email: ${error.message}`)
  }

  return { emailId: email.id, workspaceId: workspace.id }
}

// Stores a single email fetched from the Gmail history API.
// Does not look up the workspace by receiving_address — workspaceId is already known.
// Sets urgency_score = 0 so historical emails sort below live inbound in the Tier 3 queue.
// Safe to call multiple times: unique(workspace_id, message_id) silently skips duplicates.
export async function storeGmailMessage(
  data: GmailMessageData
): Promise<IngestResult | null> {
  const supabase = createAdminClient()

  const { name: fromName, address: fromAddress } = parseFromAddress(data.from)

  const { data: email, error } = await supabase
    .from('emails')
    .insert({
      workspace_id: data.workspaceId,
      message_id: data.messageId,
      from_address: fromAddress,
      from_name: fromName,
      to_addresses: data.toAddresses,
      cc_addresses: data.ccAddresses,
      subject: data.subject,
      body_text: data.bodyText,
      received_at: data.receivedAt,
      processing_state: 'received',
      urgency_score: 0,
      attachments: [],
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return null
    }
    throw new Error(`[ingest] storeGmailMessage failed: ${error.message}`)
  }

  return { emailId: email.id, workspaceId: data.workspaceId }
}
