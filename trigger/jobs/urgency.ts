import { task, tasks } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { runUrgencyScan } from '@/lib/ai/tier2'
import type { processQueuedEmailsTask } from '@/trigger/jobs/process-queue'

export interface UrgencyPayload {
  emailId: string
}

export const urgencyTask = task({
  id: 'urgency-scan',
  maxDuration: 60,
  run: async (payload: UrgencyPayload) => {
    const { emailId } = payload
    const supabase = createAdminClient()

    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`urgency-scan: email ${emailId} not found`)

    const result = await runUrgencyScan(email)

    await supabase
      .from('emails')
      .update({
        urgency_score: result.urgency_score,
        urgency_reason: result.urgency_reason,
        requires_response: result.requires_response,
        response_by: result.response_by,
        processing_state: 'queued',
      })
      .eq('id', emailId)

    // Broadcast urgency data to the UI via Supabase Realtime.
    // The cockpit subscribes to this channel per workspace.
    // httpSend() is used explicitly because this runs in a background job with no
    // WebSocket connection. send() would silently fall back to REST and log a deprecation warning.
    const channel = supabase.channel(`workspace:${email.workspace_id}`)
    await channel.httpSend({
      type: 'broadcast',
      event: 'urgency_update',
      payload: {
        email_id: emailId,
        urgency_score: result.urgency_score,
        urgency_reason: result.urgency_reason,
        requires_response: result.requires_response,
      },
    })
    await supabase.removeChannel(channel)

    // Poke the processor so classification starts within seconds rather than
    // waiting for the next 15-minute cron tick.
    await tasks.trigger<typeof processQueuedEmailsTask>('process-queued-emails', undefined)

    return { emailId, urgency_score: result.urgency_score }
  },
})
