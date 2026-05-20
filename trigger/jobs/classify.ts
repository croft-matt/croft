import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyEmail } from '@/lib/email/batch'

// Runs every 15 minutes. Processes all queued emails in sequence.
// Sequential (not parallel) to maximise Anthropic prompt cache hits.
// High-urgency emails are processed first.
export const classifyBatchTask = schedules.task({
  id: 'classify-batch',
  cron: '*/15 * * * *',
  maxDuration: 600,
  run: async () => {
    const supabase = createAdminClient()

    const { data: emails } = await supabase
      .from('emails')
      .select('id')
      .eq('processing_state', 'queued')
      .order('urgency_score', { ascending: false })
      .order('received_at', { ascending: true })
      .limit(50)

    if (!emails || emails.length === 0) return { processed: 0 }

    let processed = 0
    let failed = 0

    for (const email of emails) {
      try {
        await classifyEmail(email.id)
        processed++
      } catch (err) {
        failed++
        console.error(`classify-batch: failed on ${email.id}:`, err)
        // Continue to next email. One failure must not stop the batch.
      }
    }

    return { processed, failed }
  },
})
