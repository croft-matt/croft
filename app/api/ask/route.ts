import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'
import { logAiUsage } from '@/lib/command-palette/usage'
import { aiInteractiveRatelimit } from '@/lib/ratelimit'
import { ASK_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface AskRequest {
  query: string
  roomId?: string
  workspaceId: string
}

interface AskSource {
  label: string
  type: 'email' | 'asset' | 'job' | 'room'
  id: string
}

interface AskResponseFound {
  answer: string
  sources: AskSource[]
  not_found: false
}

interface AskResponseNotFound {
  not_found: true
  not_found_reason: string
}

type AskResponse = AskResponseFound | AskResponseNotFound

const RETRIEVAL_TOOL = {
  name: 'return_answer',
  description: 'Return a factual answer with full citations. Use only data present in the context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      answer: {
        type: 'string',
        description:
          'The factual answer in the shortest form possible. Every claim must map to a source below. Omit if not_found is true.',
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Human-readable reference, e.g. "Phil — flights email" or "TessaracT budget.xlsx"',
            },
            type: { type: 'string', enum: ['email', 'asset', 'job', 'room'] },
            id: {
              type: 'string',
              description: 'The exact ID from the context, e.g. [id:abc-123]',
            },
          },
          required: ['label', 'type', 'id'],
        },
        description: 'All sources the answer draws from. Must not be empty when not_found is false.',
      },
      not_found: {
        type: 'boolean',
        description:
          'Set true ONLY when no data related to the query exists anywhere in the context. If any partial information exists, set false and return what you have.',
      },
      not_found_reason: {
        type: 'string',
        description:
          'Required when not_found is true. State specifically what is absent, e.g. "No budget figures found for this room."',
      },
    },
    required: ['not_found'],
  },
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser()
  const body = (await request.json()) as AskRequest
  const { query, roomId, workspaceId } = body

  if (!query?.trim() || !workspaceId) {
    return NextResponse.json({ error: 'query and workspaceId are required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { success: aiAllowed } = await aiInteractiveRatelimit.limit(workspaceId)
  if (!aiAllowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let context: string
  if (roomId) {
    context = await buildRoomContext(roomId, workspaceId, supabase)
  } else {
    context = await buildGlobalContext(workspaceId, supabase)
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: ASK_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` }],
    tools: [RETRIEVAL_TOOL],
    tool_choice: { type: 'tool', name: 'return_answer' },
  })

  const toolBlock = response.content.find((b) => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    return NextResponse.json({ error: 'no tool call' }, { status: 500 })
  }

  const result = toolBlock.input as {
    answer?: string
    sources?: AskSource[]
    not_found: boolean
    not_found_reason?: string
  }

  try {
    await logAiUsage({
      workspaceId,
      userId: user.id,
      eventType: 'ask',
      modelUsed: 'claude-haiku-4-5-20251001',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      roomId: roomId ?? undefined,
    })
  } catch {
    // Logging failure must not fail the response.
  }

  if (result.not_found) {
    const res: AskResponseNotFound = {
      not_found: true,
      not_found_reason: result.not_found_reason ?? 'No relevant information found.',
    }
    return NextResponse.json(res)
  }

  const res: AskResponseFound = {
    answer: result.answer ?? '',
    sources: result.sources ?? [],
    not_found: false,
  }
  return NextResponse.json(res)
}

async function buildRoomContext(
  roomId: string,
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const lines: string[] = []

  const { data: room } = await supabase
    .from('rooms')
    .select('id, name, room_summary, room_data')
    .eq('id', roomId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!room) return 'Room not found.'

  lines.push(`Room: ${room.name} [id:${room.id}]`)
  if (room.room_summary) lines.push(`Summary: ${room.room_summary}`)

  // Get all email IDs in this room once — used by multiple sections below.
  const { data: roomEmailRows } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)

  const emailIds = roomEmailRows?.map((r) => r.email_id) ?? []

  // Open jobs — no cap.
  if (emailIds.length) {
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id, intent, description, owner, due, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .in('email_id', emailIds)

    const openJobs = jobRows ?? []
    if (openJobs.length) {
      lines.push(`\nOpen jobs (${openJobs.length}):`)
      openJobs.forEach((j) => {
        const owner = j.owner ?? 'unassigned'
        const due = j.due ? ` | due: ${j.due}` : ''
        lines.push(`- [id:${j.id}] [${j.intent}] ${j.description} | owner: ${owner}${due}`)
      })
    }
  }

  // Facts from room_data JSONB — no cap.
  const roomData = (room.room_data ?? {}) as Record<string, unknown>
  const facts: string[] = []
  for (const [category, keys] of Object.entries(roomData)) {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
      const sf = stored as { value: unknown; kind?: string; confidence?: number }
      if (typeof sf.value !== 'string') continue
      facts.push(`- [${sf.kind ?? 'other'}] ${category} / ${key}: ${sf.value}`)
    }
  }
  if (facts.length) {
    lines.push(`\nExtracted facts (${facts.length}):`)
    facts.forEach((f) => lines.push(f))
  }

  // Assets — include extracted_text.
  const { data: assets } = await supabase
    .from('assets')
    .select('id, filename, likely_type, extracted_text')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })

  if (assets?.length) {
    lines.push(`\nAssets (${assets.length}):`)
    assets.forEach((a) => {
      const type = a.likely_type ? ` (${a.likely_type})` : ''
      lines.push(`- [id:${a.id}] ${a.filename}${type}`)
      if (a.extracted_text) {
        lines.push(`  ${a.extracted_text.slice(0, 800)}`)
      }
    })
  }

  // Emails in the room.
  if (emailIds.length) {
    const { data: emails } = await supabase
      .from('emails')
      .select('id, subject, from_address, received_at, subject_summary')
      .in('id', emailIds)
      .order('received_at', { ascending: false })
      .limit(40)

    if (emails?.length) {
      lines.push(`\nEmails (${emails.length}):`)
      emails.forEach((e) => {
        const date = e.received_at ? new Date(e.received_at).toISOString().slice(0, 10) : ''
        const subj = e.subject_summary ?? e.subject ?? '(no subject)'
        lines.push(`- [id:${e.id}] From: ${e.from_address} | Subject: ${subj} | ${date}`)
      })
    }
  }

  // Contacts scoped to this room's emails.
  if (emailIds.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('name, email_address')
      .eq('workspace_id', workspaceId)
      .in('source_email_id', emailIds)
      .limit(30)

    if (contacts?.length) {
      lines.push(
        `\nContacts: ${contacts.map((c) => `${c.name ?? c.email_address} <${c.email_address}>`).join(', ')}`,
      )
    }
  }

  return lines.join('\n')
}

async function buildGlobalContext(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const lines: string[] = []

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, room_summary, room_data, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('name')

  const activeRooms = rooms ?? []
  lines.push(`Active rooms (${activeRooms.length}):`)
  activeRooms.forEach((r) => {
    lines.push(`- ${r.name} [id:${r.id}]${r.room_summary ? ': ' + r.room_summary : ''}`)

    // Top facts per room.
    const roomData = (r.room_data ?? {}) as Record<string, unknown>
    let factCount = 0
    for (const [category, keys] of Object.entries(roomData)) {
      if (factCount >= 10) break
      if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
      for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
        if (factCount >= 10) break
        if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
        const sf = stored as { value: unknown; kind?: string }
        if (typeof sf.value !== 'string') continue
        lines.push(`  - ${category} / ${key}: ${sf.value}`)
        factCount++
      }
    }
  })

  // Overdue jobs.
  const { data: overdue } = await supabase
    .from('jobs')
    .select('id, description, due, owner')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', new Date().toISOString())
    .order('due')
    .limit(20)

  if (overdue?.length) {
    lines.push(`\nOverdue jobs:`)
    overdue.forEach((j) => {
      lines.push(`- [id:${j.id}] ${j.description} (owner: ${j.owner ?? 'unassigned'}, due: ${j.due})`)
    })
  }

  // Jobs awaiting the user.
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const userAddresses = (accounts ?? []).map((a) => a.email_address)

  if (userAddresses.length) {
    const { data: awaitingMe } = await supabase
      .from('jobs')
      .select('id, description, due')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .in('owner', userAddresses)
      .order('created_at')
      .limit(20)

    if (awaitingMe?.length) {
      lines.push(`\nAwaiting you:`)
      awaitingMe.forEach((j) => {
        lines.push(`- [id:${j.id}] ${j.description}${j.due ? ` (due ${j.due})` : ''}`)
      })
    }
  }

  return lines.join('\n')
}
