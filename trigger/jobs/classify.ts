import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyEmail } from '@/lib/email/batch'

function isRateLimitError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    return e['status'] === 429 || (typeof e['message'] === 'string' && e['message'].includes('rate_limit'))
  }
  return false
}

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
    let rateLimited = 0

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i]
      try {
        await classifyEmail(email.id)
        processed++
      } catch (err) {
        // 429s are transient. Reset the email to queued so the next batch
        // run picks it up. Do not count it as a permanent failure.
        if (isRateLimitError(err)) {
          rateLimited++
          console.warn(`classify-batch: rate limited on ${email.id}, resetting to queued`)
          await supabase
            .from('emails')
            .update({ processing_state: 'queued' })
            .eq('id', email.id)
          // Stop processing for this run. Remaining emails stay queued.
          break
        }
        failed++
        console.error(`classify-batch: failed on ${email.id}:`, err)
        // Continue to next email. One failure must not stop the batch.
      }

      // Pace requests to stay under the Anthropic token rate limit.
      // Tier 3 uses ~6-8k tokens per email. At 30k tokens/min that is
      // roughly 4 emails/min. 16 seconds between calls keeps us safe.
      if (i < emails.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 16_000))
      }
    }

    return { processed, failed, rateLimited }
  },
})
