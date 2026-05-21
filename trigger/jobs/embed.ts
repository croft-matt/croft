import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/ai/embeddings'

export interface EmbedPayload {
  emailId: string
}

export const embedTask = task({
  id: 'generate-embedding',
  maxDuration: 60,
  run: async (payload: EmbedPayload) => {
    const { emailId } = payload
    const supabase = createAdminClient()

    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`generate-embedding: email ${emailId} not found`)

    const embedding = await generateEmbedding(email)

    await supabase
      .from('emails')
      .update({ embedding })
      .eq('id', emailId)

    return { emailId }
  },
})
