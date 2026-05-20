import { task } from '@trigger.dev/sdk/v3'
import { fetchAndStoreEmailBody } from '@/lib/email/fetch-body'
import { createAdminClient } from '@/lib/supabase/admin'
import { noiseGateTask } from './noise-gate'

export interface FetchBodyPayload {
  emailId: string
}

export const fetchBodyTask = task({
  id: 'fetch-body',
  maxDuration: 30,
  run: async (payload: FetchBodyPayload) => {
    const { emailId } = payload

    await fetchAndStoreEmailBody(emailId)

    // Update state and kick off Tier 1.
    const supabase = createAdminClient()
    await supabase
      .from('emails')
      .update({ processing_state: 'received' })
      .eq('id', emailId)
      .eq('processing_state', 'received')

    await noiseGateTask.trigger({ emailId })

    return { emailId }
  },
})
