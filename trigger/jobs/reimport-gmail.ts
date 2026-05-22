import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { importGmailHistoryTask } from './import-gmail-history'

// Trigger once from the Trigger.dev dashboard with no payload.
// Finds all connected Gmail accounts and triggers import-gmail-history for each.
// Use this to re-populate gmail_message_id and attachment metadata on recent emails.
// After this completes, run backfill-attachments to download the actual bytes.
export const reimportGmailTask = task({
  id: 'reimport-gmail',
  maxDuration: 30,
  run: async () => {
    const supabase = createAdminClient()

    const { data: accounts, error } = await supabase
      .from('email_accounts')
      .select('id, email_address')
      .eq('provider', 'google')

    if (error) {
      throw new Error(`reimport-gmail: failed to query accounts: ${error.message}`)
    }

    if (!accounts || accounts.length === 0) {
      return { triggered: 0, message: 'No Gmail accounts found.' }
    }

    for (const account of accounts) {
      await importGmailHistoryTask.trigger({ accountId: account.id })
    }

    return {
      triggered: accounts.length,
      accounts: accounts.map((a) => a.email_address),
      message: `Triggered import-gmail-history for ${accounts.length} account(s). Run backfill-attachments once these complete.`,
    }
  },
})
