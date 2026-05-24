import { task } from '@trigger.dev/sdk/v3'
import { processQueuedEmails } from '@/lib/email/process-queue'

// Singleton task: only one run executes at a time (concurrencyLimit 1).
// Multiple triggers coalesce: at most one active and one waiting.
// Each run re-queries all queued emails so nothing is missed or double-processed.
// Re-triggers itself when remaining emails are still queued so the queue drains
// without waiting for the next cron tick.
export const processQueuedEmailsTask = task({
  id: 'process-queued-emails',
  queue: { concurrencyLimit: 1 },
  maxDuration: 600,
  run: async () => {
    const result = await processQueuedEmails()

    if (result.remaining > 0) {
      await processQueuedEmailsTask.trigger({})
    }

    return result
  },
})
