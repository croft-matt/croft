import Anthropic from '@anthropic-ai/sdk'
import type { Tool } from '@anthropic-ai/sdk/resources'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_3_SYSTEM_PROMPT, EXTRACTION_TOOL_SCHEMA } from '@/lib/ai/prompts'
import { FIRST_PARTY_TIER3_SYSTEM_PROMPT, buildFirstPartyEmailContent } from '@/lib/ai/prompts-first-party'
import { type ReconciliationContext } from '@/lib/ai/reconciliation-context'
import { buildRoomTree, type RoomRecord, type RoomTreeNode, type RoomWithContext } from '@/lib/rooms/tree'
import type { Email, Extraction, AttachmentMeta } from '@/lib/types/database'
import type { AttachmentText } from '@/lib/email/fetch-attachment-texts'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + '...' : s
}

// Converts a flat list of rooms (with parent IDs) into an indented string
// for the model to read as a tree. Two spaces per depth level.
// When rooms carry RoomWithContext enrichment, each room also shows its open
// job descriptions and recent inbound email subjects so the model can match
// confidently even when the incoming email subject is vague.
export function formatRoomTree(rooms: RoomRecord[]): string {
  if (rooms.length === 0) return 'No rooms created yet.'

  const nodes = buildRoomTree(rooms)

  function renderNode(node: RoomTreeNode, depth: number): string {
    const indent = '  '.repeat(depth)
    const ctx = node as unknown as RoomWithContext
    const label = ctx.description ? `${node.name} -- ${ctx.description}` : node.name
    const lines: string[] = [`${indent}${label}`]

    if (ctx.openJobDescriptions && ctx.openJobDescriptions.length > 0) {
      const items = ctx.openJobDescriptions.map((j) => truncate(j, 70))
      lines.push(`${indent}  jobs: ${items.join(', ')}`)
    }

    if (ctx.recentSubjects && ctx.recentSubjects.length > 0) {
      const items = ctx.recentSubjects.map((s) => `"${truncate(s, 70)}"`)
      lines.push(`${indent}  emails: ${items.join(', ')}`)
    }

    for (const child of node.children) {
      lines.push(renderNode(child, depth + 1))
    }
    return lines.join('\n')
  }

  return nodes.map((n) => renderNode(n, 0)).join('\n')
}

export interface RateLimitHeaders {
  tokensRemaining: number | null
  tokensReset: string | null
  retryAfter: number | null
}

export interface ClassificationResult {
  extraction: Extraction
  extraction_complete: boolean
  subject_summary: string
  rateLimitHeaders: RateLimitHeaders
}

function buildEmailContent(
  email: Email,
  context: ReconciliationContext,
  attachmentTexts: AttachmentText[] = [],
): string {
  const body = email.body_text ?? ''
  const attachments = (email.attachments as unknown as AttachmentMeta[] | null) ?? []
  const attachmentList = attachments.length > 0
    ? `\nAttachments: ${attachments.map((a) => a.filename).join(', ')}`
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

  // Full text content from attachments (PDF, DOCX, plain text).
  // Each attachment is rendered as its own section so the model can attribute
  // specific facts, deadlines, and jobs to the correct document.
  if (attachmentTexts.length > 0) {
    for (const att of attachmentTexts) {
      parts.push(`## Attachment: ${att.filename}\n\n${att.text}`)
    }
  }

  // All prior emails in the thread, oldest first. Full body text -- no cap.
  // The model needs full thread history for closes_jobs reconciliation on long threads.
  // Attachment texts extracted from prior emails are appended inline so the model
  // can trace facts (deliverables, deadlines, signatures) back to the email they arrived with.
  if (context.thread.length > 0) {
    const entries = context.thread.map((prior) => {
      const snippet = prior.body_text ?? ''
      const header = `From: ${prior.from}\nDate: ${prior.received_at}\nSubject: ${prior.subject ?? '(no subject)'}`
      const body = `${header}\n\n${snippet}`
      if (prior.attachmentTexts.length === 0) return body
      const attSections = prior.attachmentTexts
        .map((a) => `### Attachment: ${a.filename}\n\n${a.text}`)
        .join('\n\n')
      return `${body}\n\n${attSections}`
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

  // Watch context candidates (Layer 4). Rooms the user seeded in advance, listing
  // this sender as an expected contact. These have high routing priority even though
  // no prior thread links them to this email.
  if (context.watchContextCandidates.length > 0) {
    const lines = context.watchContextCandidates.map(
      (c) => `Room: ${c.roomName} (id: ${c.roomId}) -- matched via watch context (sender is a listed expected contact)`,
    )
    parts.push(
      `## Watch context matched rooms\n\nThe following rooms were created by the user before any email thread existed. The user listed this sender as an expected contact. Treat these as high-priority routing candidates, equivalent to a thread match.\n\n${lines.join('\n')}`,
    )
  }

  // Room hierarchy: model uses this to suggest paths and reuse existing names.
  // formatRoomTree returns an indented string. Truncate at 3000 chars to cap token cost
  // on large workspaces — the model only needs enough context to match and name rooms.
  const roomTreeText = formatRoomTree(context.rooms)
  parts.push(`## Existing rooms in this workspace\n\n${roomTreeText.slice(0, 5000)}`)

  return parts.join('\n\n---\n\n')
}

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null
  const n = parseInt(value, 10)
  return isNaN(n) ? null : n
}

export async function runFullClassification(
  email: Email,
  context: ReconciliationContext,
  attachmentTexts: AttachmentText[] = [],
): Promise<ClassificationResult> {
  const startedAt = Date.now()
  const supabase = createAdminClient()

  try {
    const { data: response, response: raw } = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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
          content: buildEmailContent(email, context, attachmentTexts),
        },
      ],
      tools: [EXTRACTION_TOOL_SCHEMA as unknown as Tool],
      tool_choice: { type: 'tool', name: 'extract_email_data' },
    }).withResponse()

    const rateLimitHeaders: RateLimitHeaders = {
      tokensRemaining: parseIntHeader(raw.headers.get('anthropic-ratelimit-input-tokens-remaining')),
      tokensReset: raw.headers.get('anthropic-ratelimit-input-tokens-reset'),
      retryAfter: parseIntHeader(raw.headers.get('retry-after')),
    }

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
      rateLimitHeaders,
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

// First-party Tier 3 classification for CC-seeded emails (source = 'user_cc').
// Uses the first-party system prompt and omits urgency scoring.
// The context is built from the matched room only -- no cross-thread reconciliation.
export async function runFirstPartyClassification(
  email: Email,
  context: ReconciliationContext,
): Promise<ClassificationResult> {
  const startedAt = Date.now()
  const supabase = createAdminClient()

  try {
    const { data: response, response: raw } = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: FIRST_PARTY_TIER3_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildFirstPartyEmailContent(email, context),
        },
      ],
      tools: [EXTRACTION_TOOL_SCHEMA as unknown as Tool],
      tool_choice: { type: 'tool', name: 'extract_email_data' },
    }).withResponse()

    const rateLimitHeaders: RateLimitHeaders = {
      tokensRemaining: parseIntHeader(raw.headers.get('anthropic-ratelimit-input-tokens-remaining')),
      tokensReset: raw.headers.get('anthropic-ratelimit-input-tokens-reset'),
      retryAfter: parseIntHeader(raw.headers.get('retry-after')),
    }

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
      rateLimitHeaders,
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
