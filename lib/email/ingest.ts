import { createHash, randomUUID } from 'crypto'
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
  inReplyTo?: string | null
  references?: string | null
  providerThreadId?: string | null
}

// Parses "Display Name <email@example.com>" or "email@example.com" into parts.
function parseFromAddress(from: string): { name: string | null; address: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/)
  if (match) {
    return { name: match[1].trim(), address: match[2].trim().toLowerCase() }
  }
  return { name: null, address: from.trim().toLowerCase() }
}

// Extracts Message-IDs from a header value, stripping angle brackets.
// Handles both single IDs (In-Reply-To) and space-separated lists (References).
function parseMessageIds(headerValue: string | null): string[] {
  if (!headerValue) return []
  const matches = headerValue.match(/<[^>]+>/g) ?? []
  return matches.map((id) => id.slice(1, -1))
}

function normaliseSubject(subject: string | null): string {
  let s = (subject ?? '').toLowerCase().trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^(re|fwd|fw)\s*:\s*/, '').trim()
  }
  return s
}

interface ResolveThreadParams {
  inReplyTo: string | null
  references: string | null
  providerThreadId: string | null
  subject: string | null
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
}

// Resolves a stable thread_id for an email using four rules in priority order.
// Must be called at ingest time so the value is set when the row is created.
export async function resolveThreadId(
  workspaceId: string,
  params: ResolveThreadParams,
): Promise<string> {
  const supabase = createAdminClient()

  // Rule 1: Reply chain. Parse IDs from In-Reply-To and References headers.
  // Include both angle-bracket-stripped and raw forms to handle provider inconsistencies.
  const parsedIds = [
    ...parseMessageIds(params.inReplyTo),
    ...parseMessageIds(params.references),
  ]

  if (parsedIds.length > 0) {
    const lookupIds = [...new Set([...parsedIds, ...parsedIds.map((id) => `<${id}>`)])]

    const { data: matches } = await supabase
      .from('emails')
      .select('thread_id')
      .eq('workspace_id', workspaceId)
      .in('message_id', lookupIds)
      .not('thread_id', 'is', null)
      .limit(1)

    if (matches?.[0]?.thread_id) return matches[0].thread_id
  }

  // Rule 2: Provider thread (Gmail). Stable across the Gmail API.
  if (params.providerThreadId) {
    return `gmail:${params.providerThreadId}`
  }

  // Rule 3: Derived key from normalised subject and participant set.
  // Deterministic: future emails to the same thread will produce the same key.
  const normSubject = normaliseSubject(params.subject)
  const participants = [
    params.fromAddress,
    ...params.toAddresses,
    ...params.ccAddresses,
  ]
    .map((a) => a.toLowerCase().trim())
    .filter(Boolean)
    .sort()

  const derivedKey = createHash('sha1')
    .update(`${workspaceId}|${normSubject}|${participants.join(',')}`)
    .digest('hex')

  if (derivedKey) return derivedKey

  // Rule 4: New thread. Only reached if derived key could not be computed.
  return randomUUID()
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

  // thread_id is resolved in the fetch-body job once reply headers are available.
  // The webhook handler must stay lean and not make extra DB reads.
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

  const threadId = await resolveThreadId(data.workspaceId, {
    inReplyTo: data.inReplyTo ?? null,
    references: data.references ?? null,
    providerThreadId: data.providerThreadId ?? null,
    subject: data.subject,
    fromAddress,
    toAddresses: data.toAddresses,
    ccAddresses: data.ccAddresses,
  })

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
      thread_id: threadId,
      in_reply_to: data.inReplyTo ?? null,
      email_references: data.references ?? null,
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
