import { schedules, tasks } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { storeGmailMessage } from '@/lib/email/ingest'
import { extractPlainText, extractAttachments } from '@/lib/email/gmail-parse'
import { noiseGateTask } from './noise-gate'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const syncGmailDeltaTask = schedules.task({
  id: 'sync-gmail-delta',
  cron: '*/2 * * * *',
  run: async () => {
    const supabase = createAdminClient()

    // Only sync accounts that have completed their initial import
    // and have a stored historyId to start from.
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id, workspace_id, last_history_id')
      .eq('history_imported', true)
      .not('last_history_id', 'is', null)

    if (!accounts || accounts.length === 0) return

    for (const account of accounts) {
      try {
        await syncAccount(account as { id: string; workspace_id: string; last_history_id: string }, supabase)
      } catch (err) {
        // Log and continue -- one account failing must not block others.
        console.error(`[sync-gmail-delta] failed for account ${account.id}:`, err)
      }
    }
  },
})

async function syncAccount(
  account: { id: string; workspace_id: string; last_history_id: string },
  supabase: ReturnType<typeof createAdminClient>
) {
  const accessToken = await getValidAccessToken(account.id)

  const url = new URL(`${GMAIL_API}/history`)
  url.searchParams.set('startHistoryId', account.last_history_id)
  url.searchParams.set('historyTypes', 'messageAdded')
  url.searchParams.set('maxResults', '100')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // historyId expired (Gmail purges history after ~30 days of inactivity).
  // Reset and re-trigger the 7-day import so the account catches up.
  if (response.status === 404) {
    await resetAndReimport(account.id, accessToken, supabase)
    return
  }

  if (!response.ok) {
    console.error(`[sync-gmail-delta] history.list failed for ${account.id}: ${response.status}`)
    return
  }

  const data = await response.json()

  // No changes since last sync. Advance historyId if a newer one was returned.
  if (!data.history || data.history.length === 0) {
    if (data.historyId) {
      await supabase
        .from('email_accounts')
        .update({ last_history_id: String(data.historyId) })
        .eq('id', account.id)
    }
    return
  }

  // Collect unique message IDs from all messagesAdded entries.
  const messageIds = new Set<string>()
  for (const entry of data.history) {
    for (const added of (entry.messagesAdded ?? [])) {
      messageIds.add(added.message.id)
    }
  }

  for (const messageId of messageIds) {
    await fetchAndIngest(messageId, account.workspace_id, accessToken)
  }

  // Advance the stored historyId to the latest returned value.
  await supabase
    .from('email_accounts')
    .update({ last_history_id: String(data.historyId) })
    .eq('id', account.id)
}

async function fetchAndIngest(
  messageId: string,
  workspaceId: string,
  accessToken: string
) {
  const response = await fetch(
    `${GMAIL_API}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) return

  const full = await response.json()
  const labelIds: string[] = full.labelIds ?? []

  // Skip messages that are not inbox or sent.
  if (
    labelIds.includes('DRAFT') ||
    labelIds.includes('SPAM') ||
    labelIds.includes('TRASH')
  ) return

  if (!labelIds.includes('INBOX') && !labelIds.includes('SENT')) return

  const source: 'inbound' | 'user_sent' = labelIds.includes('SENT') ? 'user_sent' : 'inbound'

  const headers: Array<{ name: string; value: string }> = full.payload?.headers ?? []
  const header = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

  const messageIdHeader = header('Message-ID') ?? full.id
  const from = header('From') ?? ''
  const to = parseAddressList(header('To'))
  const cc = parseAddressList(header('Cc'))
  const subject = header('Subject')
  const dateStr = header('Date')
  const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
  const inReplyTo = header('In-Reply-To')
  const references = header('References')
  const bodyText = extractPlainText(full.payload ?? null)
  const attachments = extractAttachments(full.payload ?? null)

  try {
    const result = await storeGmailMessage({
      workspaceId,
      messageId: messageIdHeader,
      gmailMessageId: full.id,
      from,
      toAddresses: to,
      ccAddresses: cc,
      subject,
      bodyText,
      receivedAt,
      inReplyTo,
      references,
      providerThreadId: full.threadId,
      attachments,
      source,
    })

    if (result) {
      // Enter the standard Tier 1/2/3 pipeline.
      // urgency_score is 0 at storage time (storeGmailMessage sets it),
      // so delta-sync emails sort below live inbound in the Tier 3 queue.
      await noiseGateTask.trigger({ emailId: result.emailId })
    }
  } catch (err: unknown) {
    // Unique constraint violation means already ingested. Safe to ignore.
    if (isUniqueViolation(err)) return
    throw err
  }
}

async function resetAndReimport(
  accountId: string,
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>
) {
  const profileRes = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profileRes.ok) return

  const profile = await profileRes.json()

  await supabase
    .from('email_accounts')
    .update({
      last_history_id: String(profile.historyId),
      history_imported: false,
    })
    .eq('id', accountId)

  await tasks.trigger('import-gmail-history', { accountId })
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  )
}

function parseAddressList(value: string | null): string[] {
  if (!value) return []
  return value.split(',').map((a) => a.trim()).filter(Boolean)
}
