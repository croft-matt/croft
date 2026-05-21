import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_2_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import type { Email } from '@/lib/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface UrgencyScanResult {
  urgency_score: number
  urgency_reason: string
  requires_response: boolean
  response_by: string | null
}

async function isVipSender(workspaceId: string, fromAddress: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('vip_senders')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email_address', fromAddress.toLowerCase())
    .maybeSingle()
  return data !== null
}

function buildTier2Content(email: Pick<Email, 'subject' | 'body_text' | 'from_address' | 'from_name'>): string {
  const words = (email.body_text ?? '').split(/\s+/).slice(0, 500).join(' ')
  return `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}
Subject: ${email.subject ?? '(no subject)'}

${words}`
}

export async function runUrgencyScan(email: Email): Promise<UrgencyScanResult> {
  const startedAt = Date.now()
  const supabase = createAdminClient()
  let error: string | null = null

  const vip = await isVipSender(email.workspace_id, email.from_address)

  let result: UrgencyScanResult = {
    urgency_score: 5,
    urgency_reason: 'fallback: defaulted on error',
    requires_response: false,
    response_by: null,
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: TIER_2_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildTier2Content(email),
        },
      ],
      tools: [
        {
          name: 'assess_urgency',
          description: 'Assess the urgency of this email.',
          input_schema: {
            type: 'object' as const,
            properties: {
              urgency_score: { type: 'number', description: 'Integer 0-10.' },
              urgency_reason: { type: 'string', description: 'One sentence shown to the user.' },
              requires_response: { type: 'boolean' },
              response_by: { type: ['string', 'null'], description: 'ISO date or null.' },
            },
            required: ['urgency_score', 'urgency_reason', 'requires_response', 'response_by'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'assess_urgency' },
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (toolUse && toolUse.type === 'tool_use') {
      result = toolUse.input as UrgencyScanResult
    }

    // VIP senders always score 8 or above regardless of content.
    if (vip && result.urgency_score < 8) {
      result.urgency_score = 8
      result.urgency_reason = `VIP sender. ${result.urgency_reason}`
    }

    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 2,
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
      tier: 2,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      duration_ms: Date.now() - startedAt,
      error,
    })
  }

  return result
}
