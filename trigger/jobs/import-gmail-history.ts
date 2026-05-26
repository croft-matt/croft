import { task, tasks } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { storeGmailMessage } from '@/lib/email/ingest'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import { extractPlainText, extractAttachments } from '@/lib/email/gmail-parse'
import { noiseGateTask } from './noise-gate'
import type { processQueuedEmailsTask } from '@/trigger/jobs/process-queue'

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
  labelIds?: string[]
  payload?: {
    mimeType?: string
    headers?: GmailHeader[]
    body?: { data?: string }
    parts?: GmailPart[]
  }
}

function detectGmailSource(labelIds: string[]): 'inbound' | 'user_sent' {
  // Draft, spam, and trash are filtered before this point.
  // A message with the SENT label was sent by the user.
  if (labelIds.includes('SENT')) return 'user_sent'
  return 'inbound'
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
    const total = messages.length
    let stored = 0
    let skipped = 0

    // Signal to the setup screen that import is underway so it redirects to the
    // processing gate. Sent before fetching so the redirect happens immediately.
    await broadcastToWorkspace(account.workspace_id, 'history_import_started', { total })
    await broadcastToWorkspace(account.workspace_id, 'import_progress', { n: 0, total })

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

          const labelIds = full.labelIds ?? []

          // Skip drafts, spam, and trash -- these are not project email.
          if (
            labelIds.includes('DRAFT') ||
            labelIds.includes('SPAM') ||
            labelIds.includes('TRASH')
          ) {
            skipped++
            continue
          }

          const source = detectGmailSource(labelIds)

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
            source,
          })

          if (result) {
            // Enter the normal Tier 1/2/3 pipeline.
            // urgency_score is initialised to 0 at storage time so these emails
            // sort below live inbound in the Tier 3 batch queue.
            await noiseGateTask.trigger({ emailId: result.emailId })
            stored++

            // Broadcast every 5 stored emails. The final broadcast after the loop
            // guarantees the bar reaches 100% regardless of batch alignment.
            if (stored % 5 === 0) {
              await broadcastToWorkspace(account.workspace_id, 'import_progress', {
                n: stored,
                total,
              })
            }
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

    // Final broadcast ensures the bar always reaches 100%.
    await broadcastToWorkspace(account.workspace_id, 'import_progress', { n: stored, total })

    await supabase
      .from('email_accounts')
      .update({ history_imported: true })
      .eq('id', accountId)

    await broadcastToWorkspace(account.workspace_id, 'history_imported', { accountId, stored, total })

    // Final kick after the import loop completes. The per-email pokes from
    // urgency-scan cover most of the import; this guarantees a pass after the
    // last email clears Tier 2. The import does not wait for Tier 3 to finish.
    await tasks.trigger<typeof processQueuedEmailsTask>('process-queued-emails', undefined)

    return { accountId, total, stored, skipped }
  },
})

function parseAddressList(value: string | null): string[] {
  if (!value) return []
  return value.split(',').map((a) => a.trim()).filter(Boolean)
}
