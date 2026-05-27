import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runNoiseGate } from '@/lib/ai/tier1'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import { urgencyTask } from './urgency'

export interface NoiseGatePayload {
  emailId: string
}

export const noiseGateTask = task({
  id: 'noise-gate',
  maxDuration: 60,
  run: async (payload: NoiseGatePayload) => {
    const { emailId } = payload
    const supabase = createAdminClient()

    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`noise-gate: email ${emailId} not found`)

    // Sent emails are always work-relevant — skip the model call entirely.
    // The user deliberately sent this email, so there is no spam/noise risk.
    if (email.source === 'user_sent') {
      await supabase
        .from('emails')
        .update({ processing_state: 'urgency_scanned' })
        .eq('id', emailId)

      await maybebroadcastFilterProgress(supabase, email.workspace_id)
      await urgencyTask.trigger({ emailId })

      return { emailId, relevant: true }
    }

    const result = await runNoiseGate(email)

    if (!result.relevant) {
      await supabase
        .from('emails')
        .update({ processing_state: 'ignored' })
        .eq('id', emailId)

      await maybebroadcastFilterProgress(supabase, email.workspace_id)

      return { emailId, relevant: false, reason: result.reason }
    }

    await supabase
      .from('emails')
      .update({ processing_state: 'urgency_scanned' })
      .eq('id', emailId)

    await maybebroadcastFilterProgress(supabase, email.workspace_id)

    await urgencyTask.trigger({ emailId })

    return { emailId, relevant: true }
  },
})

// Queries absolute filtered/total counts for the workspace and broadcasts
// filter_progress every 10 emails. The absolute payload lets the client set
// rather than increment, so missed events do not cause drift.
async function maybebroadcastFilterProgress(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const [{ count: filtered }, { count: total }] = await Promise.all([
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .neq('processing_state', 'received'),
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
  ])

  const f = filtered ?? 0
  const t = total ?? 0

  if (f % 10 === 0 || f === t) {
    await broadcastToWorkspace(workspaceId, 'filter_progress', { filtered: f, total: t })
  }
}
