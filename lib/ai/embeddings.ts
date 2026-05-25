import { VoyageAIClient } from 'voyageai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Email } from '@/lib/types/database'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })

// Input is capped at 4000 characters — well within voyage-3's 32k token context.
const MAX_CHARS = 4000

function buildEmbeddingInput(email: Pick<Email, 'subject' | 'body_text'>): string {
  const subject = email.subject ?? ''
  const body = email.body_text ?? ''
  return `${subject}\n\n${body}`.slice(0, MAX_CHARS)
}

export async function generateEmbedding(email: Email): Promise<number[]> {
  const startedAt = Date.now()
  const supabase = createAdminClient()

  try {
    const response = await voyage.embed({
      input: buildEmbeddingInput(email),
      model: 'voyage-3',
    })

    const embedding = response.data?.[0]?.embedding
    if (!embedding) {
      throw new Error('No embedding returned from Voyage AI')
    }

    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 3,
      model: 'voyage-3',
      input_tokens: response.usage?.totalTokens ?? null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      duration_ms: Date.now() - startedAt,
      error: null,
    })

    return embedding
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 3,
      model: 'voyage-3',
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      duration_ms: Date.now() - startedAt,
      error,
    })
    throw err
  }
}
