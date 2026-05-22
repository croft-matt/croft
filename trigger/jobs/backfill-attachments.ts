import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAttachmentsTask } from './fetch-attachments'
import { fetchGmailAttachmentsTask } from './fetch-gmail-attachments'

// One-off backfill task. Trigger once from the Trigger.dev dashboard with no payload.
// Finds all processed emails that have attachments but no downloaded asset files,
// and enqueues the appropriate fetch job (Resend or Gmail) for each one.
//
// For existing Gmail emails that predate the gmail_message_id migration, run
// import-gmail-history first to re-populate gmail_message_id and attachment metadata.
export const backfillAttachmentsTask = task({
  id: 'backfill-attachments',
  maxDuration: 60,
  run: async () => {
    const supabase = createAdminClient()

    const { data: emails, error } = await supabase
      .from('emails')
      .select('id, workspace_id, resend_email_id, gmail_message_id, attachments')
      .eq('processing_state', 'processed')

    if (error) {
      throw new Error(`backfill-attachments: failed to query emails: ${error.message}`)
    }

    let resendTriggered = 0
    let gmailTriggered = 0
    let skipped = 0

    for (const email of emails ?? []) {
      const attachments = Array.isArray(email.attachments) ? email.attachments : []
      if (attachments.length === 0) {
        skipped++
        continue
      }

      if (email.resend_email_id) {
        await fetchAttachmentsTask.trigger({
          emailId: email.id,
          workspaceId: email.workspace_id,
          resendEmailId: email.resend_email_id,
        })
        resendTriggered++
      } else if (email.gmail_message_id) {
        await fetchGmailAttachmentsTask.trigger({
          emailId: email.id,
          workspaceId: email.workspace_id,
          gmailMessageId: email.gmail_message_id,
        })
        gmailTriggered++
      } else {
        // Email has attachments but no provider ID stored yet.
        // Re-run import-gmail-history to populate gmail_message_id first.
        skipped++
      }
    }

    return {
      resendTriggered,
      gmailTriggered,
      skipped,
      message: `Resend: ${resendTriggered}, Gmail: ${gmailTriggered}, skipped (no provider ID): ${skipped}`,
    }
  },
})
