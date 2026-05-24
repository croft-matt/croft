import { schedules, tasks } from '@trigger.dev/sdk/v3'
import type { processQueuedEmailsTask } from '@/trigger/jobs/process-queue'

// Fallback cron: runs every 15 minutes and pokes the shared processor.
// Normal processing is event-driven via urgency-scan and import-gmail-history.
// This cron exists to catch anything those triggers missed, for example an
// email that failed Tier 2 and was retried after both event triggers had fired.
export const classifyBatchTask = schedules.task({
  id: 'classify-batch',
  cron: '*/15 * * * *',
  maxDuration: 60,
  run: async () => {
    await tasks.trigger<typeof processQueuedEmailsTask>('process-queued-emails', {})
    return { triggered: true }
  },
})
