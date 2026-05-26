import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'
import { logAiUsage } from '@/lib/command-palette/usage'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface AskRequest {
  query: string
  roomId?: string
  workspaceId: string
}

interface AskSource {
  label: string
  roomId?: string
  emailId?: string
}

interface AskResponse {
  answer: string
  sources: AskSource[]
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser()
  const body = (await request.json()) as AskRequest
  const { query, roomId, workspaceId } = body

  if (!query?.trim() || !workspaceId) {
    return NextResponse.json({ error: 'query and workspaceId are required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify workspace membership.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all active rooms for source matching.
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  const allRooms = rooms ?? []

  let context: string
  if (roomId) {
    context = await buildRoomContext(roomId, workspaceId, supabase)
  } else {
    context = await buildGlobalContext(workspaceId, supabase)
  }

  const systemPrompt = `You are Croft, an AI project intelligence layer. You answer questions about the user's project data concisely and accurately.

Rules:
- Answer in 1-4 sentences or a short list (3-5 items max).
- Only use information present in the provided context. Do not infer or fabricate.
- If the context does not contain enough information to answer, say so plainly.
- Do not use em-dashes.
- Do not start your answer with "I" or "Based on".
- If listing items, use a plain bulleted list with "-" characters.
- At the end of your answer, include a "sources:" line listing the 1-3 most relevant rooms or facts you drew from, formatted as: sources: Room Name, Room Name`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${query}`,
      },
    ],
  })

  const rawAnswer =
    response.content[0].type === 'text' ? response.content[0].text : ''

  const parsed = parseAskResponse(rawAnswer, allRooms)

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

  return NextResponse.json(parsed)
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

  lines.push(`Room: ${room.name}`)
  if (room.room_summary) lines.push(`Summary: ${room.room_summary}`)

  // Open jobs via room_emails join.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('intent, description, owner, due, status, email_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .in(
      'email_id',
      (
        await supabase
          .from('room_emails')
          .select('email_id')
          .eq('room_id', roomId)
      ).data?.map(r => r.email_id) ?? [],
    )
    .limit(20)

  const openJobs = jobRows ?? []
  if (openJobs.length) {
    lines.push(`\nOpen jobs (${openJobs.length}):`)
    openJobs.forEach(j => {
      const owner = j.owner ?? 'unassigned'
      const due = j.due ? ` (due ${j.due})` : ''
      lines.push(`- [${j.intent}] ${j.description} | owner: ${owner}${due}`)
    })
  }

  // Facts from room_data JSONB.
  const roomData = (room.room_data ?? {}) as Record<string, unknown>
  const facts: string[] = []
  for (const [category, keys] of Object.entries(roomData)) {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
      const sf = stored as { value: unknown; kind?: string; confidence?: number }
      if (typeof sf.value !== 'string') continue
      const conf = sf.confidence ?? 1
      facts.push(`- [${sf.kind ?? 'other'}] ${category} / ${key}: ${sf.value} (confidence ${conf})`)
    }
  }
  if (facts.length) {
    lines.push(`\nExtracted facts (${facts.length}):`)
    facts.slice(0, 30).forEach(f => lines.push(f))
  }

  // Contacts.
  const emailIds = (
    await supabase
      .from('room_emails')
      .select('email_id')
      .eq('room_id', roomId)
  ).data?.map(r => r.email_id) ?? []

  if (emailIds.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('name, email_address')
      .eq('workspace_id', workspaceId)
      .limit(20)

    if (contacts?.length) {
      lines.push(`\nContacts: ${contacts.map(c => `${c.name ?? c.email_address} <${c.email_address}>`).join(', ')}`)
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
    .select('id, name, room_summary, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('name')

  const activeRooms = rooms ?? []
  lines.push(`Active rooms (${activeRooms.length}):`)
  activeRooms.forEach(r => {
    lines.push(`- ${r.name}${r.room_summary ? ': ' + r.room_summary : ''}`)
  })

  // Overdue jobs.
  const { data: overdue } = await supabase
    .from('jobs')
    .select('description, due, owner')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', new Date().toISOString())
    .order('due')
    .limit(20)

  if (overdue?.length) {
    lines.push(`\nOverdue jobs:`)
    overdue.forEach(j => {
      lines.push(`- ${j.description} (owner: ${j.owner ?? 'unassigned'}, due: ${j.due})`)
    })
  }

  // Connected email addresses for awaiting-me.
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const userAddresses = (accounts ?? []).map(a => a.email_address)

  if (userAddresses.length) {
    const { data: awaitingMe } = await supabase
      .from('jobs')
      .select('description, due')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .in('owner', userAddresses)
      .order('created_at')
      .limit(20)

    if (awaitingMe?.length) {
      lines.push(`\nAwaiting you:`)
      awaitingMe.forEach(j => {
        lines.push(`- ${j.description}${j.due ? ` (due ${j.due})` : ''}`)
      })
    }
  }

  return lines.join('\n')
}

function parseAskResponse(
  rawAnswer: string,
  rooms: { id: string; name: string }[],
): AskResponse {
  const sourcesMatch = rawAnswer.match(/sources:\s*(.+)$/im)
  const answer = rawAnswer.replace(/sources:.+$/im, '').trim()
  const sourceNames = sourcesMatch
    ? sourcesMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    : []

  const sources: AskSource[] = sourceNames
    .map(name => {
      const room = rooms.find(r => r.name.toLowerCase() === name.toLowerCase())
      return room ? { label: room.name, roomId: room.id } : { label: name }
    })
    .filter(s => s.label)
    .slice(0, 3)

  return { answer, sources }
}
