import { task } from '@trigger.dev/sdk/v3'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { storeGmailMessage } from '@/lib/email/ingest'
import { noiseGateTask } from './noise-gate'

export interface ImportGmailHistoryPayload {
  accountId: string
}

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 100

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

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )
    auth.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth })

    // Fetch the last 7 days of message IDs.
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:7d',
      maxResults: 500,
    })

    const messages = listResponse.data.messages ?? []
    let stored = 0
    let skipped = 0

    // Process in batches to stay within Gmail API rate limits.
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)

      for (const msg of batch) {
        if (!msg.id) continue

        try {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          })

          const headers = full.data.payload?.headers ?? []
          const header = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

          const messageId = header('Message-ID') ?? msg.id
          const from = header('From') ?? account.email_address
          const to = parseAddressList(header('To'))
          const cc = parseAddressList(header('Cc'))
          const subject = header('Subject')
          const dateStr = header('Date')
          const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
          const bodyText = extractPlainText(full.data.payload)

          const result = await storeGmailMessage({
            workspaceId: account.workspace_id,
            messageId,
            from,
            toAddresses: to,
            ccAddresses: cc,
            subject,
            bodyText,
            receivedAt,
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
          // Log and continue — one bad message should not stop the import.
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

// Parses a comma-separated address header into an array of strings.
function parseAddressList(value: string | null): string[] {
  if (!value) return []
  return value.split(',').map((a) => a.trim()).filter(Boolean)
}

// Recursively walks the message payload to find the first text/plain part.
function extractPlainText(
  payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null } | null | undefined
): string | null {
  if (!payload) return null

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainText(
        part as Parameters<typeof extractPlainText>[0]
      )
      if (result) return result
    }
  }

  return null
}
