import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
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

    const result = await runNoiseGate(email)

    if (!result.relevant) {
      await supabase
        .from('emails')
        .update({ processing_state: 'ignored' })
        .eq('id', emailId)

      await broadcastToWorkspace(email.workspace_id, 'filter_progress', { emailId, passed: false })

      return { emailId, relevant: false, reason: result.reason }
    }

    await supabase
      .from('emails')
      .update({ processing_state: 'urgency_scanned' })
      .eq('id', emailId)

    await broadcastToWorkspace(email.workspace_id, 'filter_progress', { emailId, passed: true })

    await urgencyTask.trigger({ emailId })

    return { emailId, relevant: true }
  },
})
