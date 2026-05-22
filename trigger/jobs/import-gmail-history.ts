import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { storeGmailMessage } from '@/lib/email/ingest'
import { noiseGateTask } from './noise-gate'
import type { AttachmentMeta } from '@/lib/types/database'

export interface ImportGmailHistoryPayload {
  accountId: string
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const BATCH_SIZE = 50
const BATCH_DELAY_MS = 100

interface GmailMessageRef {
  id: string
  threadId: string
}

interface GmailMessageListResponse {
  messages?: GmailMessageRef[]
  nextPageToken?: string
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPart[]
  headers?: Array<{ name: string; value: string }>
}

interface GmailMessage {
  id: string
  payload?: {
    mimeType?: string
    headers?: GmailHeader[]
    body?: { data?: string }
    parts?: GmailPart[]
  }
}

export const importGmailHistoryTask = task({
  id: 'import-gmail-history',
  maxDuration: 600,
  run: async (payload: ImportGmailHistoryPayload) => {
    const { accountId } = payload
    const supabase = createAdminClient()

    const { data: account } = await supabase
      .from('email_accounts')
      .select('workspace_id, email_address')
      .eq('id', accountId)
      .single()

    if (!account) throw new Error(`import-gmail-history: account ${accountId} not found`)

    const accessToken = await getValidAccessToken(accountId)

    // Fetch the last 7 days of message IDs.
    const listUrl = new URL(`${GMAIL_API}/messages`)
    listUrl.searchParams.set('q', 'newer_than:7d')
    listUrl.searchParams.set('maxResults', '500')

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!listRes.ok) {
      const body = await listRes.text()
      throw new Error(`import-gmail-history: messages.list failed (${listRes.status}): ${body}`)
    }

    const listData = (await listRes.json()) as GmailMessageListResponse
    const messages = listData.messages ?? []
    let stored = 0
    let skipped = 0

    // Process in batches to stay within Gmail API rate limits.
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)

      for (const msg of batch) {
        try {
          const msgUrl = new URL(`${GMAIL_API}/messages/${msg.id}`)
          msgUrl.searchParams.set('format', 'full')

          const msgRes = await fetch(msgUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!msgRes.ok) {
            console.error(`[import-gmail-history] messages.get failed for ${msg.id}: ${msgRes.status}`)
            continue
          }

          const full = (await msgRes.json()) as GmailMessage

          const headers = full.payload?.headers ?? []
          const header = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

          const messageId = header('Message-ID') ?? msg.id
          const from = header('From') ?? account.email_address
          const to = parseAddressList(header('To'))
          const cc = parseAddressList(header('Cc'))
          const subject = header('Subject')
          const dateStr = header('Date')
          const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
          const bodyText = extractPlainText(full.payload ?? null)
          const inReplyTo = header('In-Reply-To')
          const references = header('References')

          const attachments = extractAttachments(full.payload ?? null)

          const result = await storeGmailMessage({
            workspaceId: account.workspace_id,
            messageId,
            gmailMessageId: msg.id,
            from,
            toAddresses: to,
            ccAddresses: cc,
            subject,
            bodyText,
            receivedAt,
            inReplyTo,
            references,
            providerThreadId: msg.threadId,
            attachments,
          })

          if (result) {
            // Enter the normal Tier 1/2/3 pipeline.
            // urgency_score is initialised to 0 at storage time so these emails
            // sort below live inbound in the Tier 3 batch queue.
            await noiseGateTask.trigger({ emailId: result.emailId })
            stored++
          } else {
            skipped++
          }
        } catch (err) {
          // Log and continue — one bad message must not stop the import.
          console.error(`[import-gmail-history] failed on message ${msg.id}:`, err)
        }
      }

      if (i + BATCH_SIZE < messages.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    await supabase
      .from('email_accounts')
      .update({ history_imported: true })
      .eq('id', accountId)

    return { accountId, total: messages.length, stored, skipped }
  },
})

function parseAddressList(value: string | null): string[] {
  if (!value) return []
  return value.split(',').map((a) => a.trim()).filter(Boolean)
}

// Filenames that are mail client internals rather than user documents.
const NOISE_FILENAMES = new Set(['smime.p7s', 'smime.p7m', 'noname', 'winmail.dat', ''])

function extractAttachments(
  payload: { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[]; headers?: Array<{ name: string; value: string }> } | null
): AttachmentMeta[] {
  if (!payload) return []

  const results: AttachmentMeta[] = []

  // A part is a user-facing attachment if it has a non-noise filename, a
  // body.attachmentId, and a Content-Disposition of attachment (not inline).
  if (payload.filename && payload.body?.attachmentId) {
    const fn = payload.filename.trim()
    const disposition = payload.headers
      ?.find((h) => h.name.toLowerCase() === 'content-disposition')
      ?.value?.toLowerCase() ?? ''
    const isInline = disposition.startsWith('inline')

    if (!NOISE_FILENAMES.has(fn.toLowerCase()) && !isInline) {
      results.push({
        filename: fn,
        mime_type: payload.mimeType ?? 'application/octet-stream',
        size: payload.body.size ?? 0,
        gmail_attachment_id: payload.body.attachmentId,
      })
    }
  }

  for (const part of payload.parts ?? []) {
    results.push(...extractAttachments(part))
  }

  return results
}

function extractPlainText(
  payload: { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] } | null
): string | null {
  if (!payload) return null

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainText(part)
      if (result) return result
    }
  }

  return null
}
