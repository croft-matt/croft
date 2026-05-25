import { schedules, tasks } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import type { noiseGateTask } from '@/trigger/jobs/noise-gate'
import type { processQueuedEmailsTask } from '@/trigger/jobs/process-queue'

// Runs every 5 minutes and recovers emails that have fallen out of the pipeline.
//
// Three stuck states are handled:
//
// `processing` older than 30 minutes: the worker was evicted or killed between
// setting the state and finishing. Reset to `queued` so the next classifier
// run picks it up. 30 minutes is conservative — real classification completes
// in seconds to a few minutes. Uses created_at as a proxy (the table has no
// processing_started_at column).
//
// `failed` with fewer than 3 attempts: the email failed a transient error.
// Reset to `queued` and increment processing_attempts. After 3 attempts the
// email stays failed so the user sees it in the failed count rather than
// cycling forever.
//
// `received` with body_text older than 5 minutes: fetch-body stored the body
// but the noiseGateTask trigger failed before firing. Re-trigger it directly.
export const sweeperTask = schedules.task({
  id: 'sweeper',
  cron: '*/5 * * * *',
  maxDuration: 120,
  run: async () => {
    const supabase = createAdminClient()
    const now = new Date()
    const processingCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
    const receivedCutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

    let queuedCount = 0
    let noiseGateTriggered = 0

    // Reset stuck `processing` emails.
    const { data: stuckProcessing } = await supabase
      .from('emails')
      .select('id')
      .eq('processing_state', 'processing')
      .lt('created_at', processingCutoff)

    if (stuckProcessing && stuckProcessing.length > 0) {
      await supabase
        .from('emails')
        .update({ processing_state: 'queued' })
        .in('id', stuckProcessing.map((e) => e.id))
      queuedCount += stuckProcessing.length
      console.log(`sweeper: reset ${stuckProcessing.length} stuck processing emails to queued`)
    }

    // Retry failed emails within attempt budget.
    const { data: failedEmails } = await supabase
      .from('emails')
      .select('id, processing_attempts')
      .eq('processing_state', 'failed')
      .lt('processing_attempts', 3)

    if (failedEmails && failedEmails.length > 0) {
      for (const email of failedEmails) {
        await supabase
          .from('emails')
          .update({
            processing_state: 'queued',
            processing_attempts: email.processing_attempts + 1,
          })
          .eq('id', email.id)
      }
      queuedCount += failedEmails.length
      console.log(`sweeper: re-queued ${failedEmails.length} failed emails`)
    }

    // Re-trigger noise gate for stuck received emails that already have body_text.
    const { data: stuckReceived } = await supabase
      .from('emails')
      .select('id')
      .eq('processing_state', 'received')
      .not('body_text', 'is', null)
      .lt('created_at', receivedCutoff)

    if (stuckReceived && stuckReceived.length > 0) {
      for (const email of stuckReceived) {
        await tasks.trigger<typeof noiseGateTask>('noise-gate', { emailId: email.id })
      }
      noiseGateTriggered += stuckReceived.length
      console.log(`sweeper: re-triggered noise gate for ${stuckReceived.length} stuck received emails`)
    }

    // Kick the processor immediately if any emails were re-queued.
    if (queuedCount > 0) {
      await tasks.trigger<typeof processQueuedEmailsTask>('process-queued-emails', undefined)
    }

    return { queuedCount, noiseGateTriggered }
  },
})
