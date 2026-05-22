import Anthropic from '@anthropic-ai/sdk'
import type { Tool } from '@anthropic-ai/sdk/resources'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_3_SYSTEM_PROMPT, EXTRACTION_TOOL_SCHEMA } from '@/lib/ai/prompts'
import { type ReconciliationContext } from '@/lib/ai/reconciliation-context'
import type { Email, Extraction } from '@/lib/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ClassificationResult {
  extraction: Extraction
  extraction_complete: boolean
  subject_summary: string
}

function buildEmailContent(email: Email, context: ReconciliationContext): string {
  const body = (email.body_text ?? '').split(/\s+/).slice(0, 2000).join(' ')
  const attachmentList = email.attachments.length > 0
    ? `\nAttachments: ${email.attachments.map((a) => a.filename).join(', ')}`
    : ''

  const parts: string[] = []

  // Current email
  parts.push(
    `From: ${email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}
To: ${(email.to_addresses as string[]).join(', ')}${email.cc_addresses && (email.cc_addresses as string[]).length > 0 ? `\nCC: ${(email.cc_addresses as string[]).join(', ')}` : ''}
Subject: ${email.subject ?? '(no subject)'}
Date: ${email.received_at}${attachmentList}

${body}`,
  )

  // Prior emails in the thread, oldest first
  if (context.thread.length > 0) {
    const entries = context.thread.map((prior) => {
      const snippet = (prior.body_text ?? '').split(/\s+/).slice(0, 200).join(' ')
      return `From: ${prior.from}\nDate: ${prior.received_at}\nSubject: ${prior.subject ?? '(no subject)'}\n\n${snippet}`
    })
    parts.push(`## Prior emails in this thread\n\n${entries.join('\n\n---\n\n')}`)
  }

  // Known facts for the project rooms this thread belongs to.
  // Candidate state is in the user message only. Never in the system prompt.
  const factsLines: string[] = []
  for (const [cat, keys] of Object.entries(context.facts)) {
    if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
      for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
        if (stored !== null && typeof stored === 'object' && 'value' in (stored as object)) {
          factsLines.push(`${cat} / ${key}: ${String((stored as { value: unknown }).value)}`)
        }
      }
    }
  }
  parts.push(
    `## Known facts for this project\n\n${factsLines.length > 0 ? factsLines.join('\n') : 'No facts recorded yet.'}`,
  )

  // Open jobs the model may be acting on. Job ids are included so the model
  // can reference them in relation verdicts.
  const jobLines = context.openJobs.map(
    (j) =>
      `${j.id} | ${j.intent} | ${j.description} | owner: ${j.owner ?? 'unassigned'} | due: ${j.due ?? 'none'}`,
  )
  parts.push(
    `## Open jobs you may be acting on\n\n${jobLines.length > 0 ? jobLines.join('\n') : 'No open jobs.'}`,
  )

  // Tell the model which address belongs to the workspace user so it can
  // attribute user commitments to the right owner.
  if (context.connectedAddress) {
    parts.push(`## User's connected address\n\n${context.connectedAddress}`)
  }

  return parts.join('\n\n---\n\n')
}

export async function runFullClassification(
  email: Email,
  context: ReconciliationContext,
): Promise<ClassificationResult> {
  const startedAt = Date.now()
  const supabase = createAdminClient()

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: TIER_3_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildEmailContent(email, context),
        },
      ],
      tools: [EXTRACTION_TOOL_SCHEMA as unknown as Tool],
      tool_choice: { type: 'tool', name: 'extract_email_data' },
    })

    const usage = response.usage as unknown as Record<string, unknown>
    const cacheReadTokens = (usage.cache_read_input_tokens as number) ?? 0
    const cacheWriteTokens = (usage.cache_creation_input_tokens as number) ?? 0

    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 3,
      model: 'claude-sonnet-4-6',
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      duration_ms: Date.now() - startedAt,
      error: null,
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Model did not return tool use output')
    }

    const extraction = toolUse.input as Extraction

    return {
      extraction,
      extraction_complete: extraction.extraction_complete,
      subject_summary: extraction.subject_summary,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await supabase.from('email_processing_log').insert({
      email_id: email.id,
      tier: 3,
      model: 'claude-sonnet-4-6',
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
