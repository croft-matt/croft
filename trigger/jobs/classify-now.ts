import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyEmail } from '@/lib/email/batch'

export interface ClassifyNowPayload {
  emailId: string
}

// On-demand Tier 3 job. Fired when a user opens an unprocessed email.
// Processes a single email immediately rather than waiting for the batch.
export const classifyNowTask = task({
  id: 'classify-now',
  maxDuration: 120,
  run: async (payload: ClassifyNowPayload) => {
    const { emailId } = payload
    const supabase = createAdminClient()

    const { data: email } = await supabase
      .from('emails')
      .select('processing_state')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`classify-now: email ${emailId} not found`)

    // Only proceed if the email is queued or urgency_scanned.
    // If already processing or processed, do nothing.
    if (!['queued', 'urgency_scanned'].includes(email.processing_state)) {
      return { emailId, skipped: true, reason: email.processing_state }
    }

    await classifyEmail(emailId)

    // Broadcast completion to the UI so structured data populates without a page refresh.
    const { data: updated } = await supabase
      .from('emails')
      .select('workspace_id')
      .eq('id', emailId)
      .single()

    if (updated) {
      const channel = supabase.channel(`workspace:${updated.workspace_id}`)
      await channel.httpSend('email_processed', { email_id: emailId })
      await supabase.removeChannel(channel)
    }

    return { emailId, skipped: false }
  },
})
