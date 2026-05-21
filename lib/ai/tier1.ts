import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_1_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import type { Email } from '@/lib/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface NoiseGateResult {
  relevant: boolean
  reason: string
}

function buildTier1Content(email: Pick<Email, 'subject' | 'body_text' | 'from_address' | 'from_name'>): string {
  const words = (email.body_text ?? '').split(/\s+/).slice(0, 300).join(' ')
  return `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}
Subject: ${email.subject ?? '(no subject)'}

${words}`
}

export async function runNoiseGate(email: Email): Promise<NoiseGateResult> {
  const startedAt = Date.now()
  const supabase = createAdminClient()
  let error: string | null = null
  let result: NoiseGateResult = { relevant: true, reason: 'fallback: defaulted to relevant on error' }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      system: [
        {
          type: 'text',
          text: TIER_1_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildTier1Content(email),
        },
      ],
      tools: [
        {
          name: 'classify_relevance',
          description: 'Classify whether this email is relevant to the user\'s work.',
          input_schema: {
            type: 'object' as const,
            properties: {
              relevant: { type: 'boolean' },
              reason: { type: 'string', description: 'One sentence for logging.' },
            },
            required: ['relevant', 'reason'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'classify_relevance' },
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (toolUse && toolUse.type === 'tool_use') {
      result = toolUse.input as NoiseGateResult
    }

    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 1,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: (response.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number ?? 0,
      cache_write_tokens: (response.usage as unknown as Record<string, unknown>).cache_creation_input_tokens as number ?? 0,
      duration_ms: Date.now() - startedAt,
      error: null,
    })
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 1,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      duration_ms: Date.now() - startedAt,
      error,
    })
    // Default to relevant on error so emails are not silently dropped.
    result = { relevant: true, reason: `error: ${error}` }
  }

  return result
}
