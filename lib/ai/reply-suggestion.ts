import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getConnectedAddresses } from '@/lib/jobs/open-loops'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const REPLY_SYSTEM_PROMPT = `You are helping a project professional reply to an email. Draft the most useful, concise reply given the context.

Rules:
- Under 100 words.
- Active voice.
- State the next action clearly if one exists.
- If an asset in the room is clearly relevant (e.g. the sender asked for a document that exists in the assets list), mention it will be attached. Do not fabricate assets.
- Do not repeat information the recipient already knows.
- No pleasantries beyond a brief opener if appropriate.
- No em-dashes. Use hyphens or rewrite the sentence.
- Do not refer to the user by name.
- Do not mention Croft.
- Plain text only, no markdown.`

export interface ComposeAsset {
  id: string
  filename: string
  storage_path: string
}

// Returns suggested reply text for an email, given the room's context.
// Returns an empty string on any error rather than throwing.
export async function generateReplySuggestion(params: {
  emailId: string
  roomId: string
}): Promise<string> {
  try {
    const { emailId, roomId } = params
    const supabase = await createClient()

    const { data: email } = await supabase
      .from('emails')
      .select('body_text, from_address, subject, thread_id, workspace_id')
      .eq('id', emailId)
      .single()

    if (!email) return ''

    const workspaceId = email.workspace_id

    const [connectedAddresses, roomEmailsResult] = await Promise.all([
      getConnectedAddresses(workspaceId),
      supabase.from('room_emails').select('email_id').eq('room_id', roomId),
    ])

    const emailIds = (roomEmailsResult.data ?? []).map((r) => r.email_id)

    const [threadResult, jobsResult, roomResult, assetsResult] = await Promise.all([
      email.thread_id
        ? supabase
            .from('emails')
            .select('body_text, from_address, received_at')
            .eq('thread_id', email.thread_id)
            .neq('id', emailId)
            .order('received_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] as Array<{ body_text: string | null; from_address: string; received_at: string }> }),

      emailIds.length > 0
        ? supabase
            .from('jobs')
            .select('description, owner, due')
            .in('email_id', emailIds)
            .eq('status', 'open')
        : Promise.resolve({ data: [] as Array<{ description: string; owner: string | null; due: string | null }> }),

      supabase.from('rooms').select('room_data').eq('id', roomId).single(),

      emailIds.length > 0
        ? supabase
            .from('assets')
            .select('id, filename, likely_type, storage_path')
            .or(`room_id.eq.${roomId},email_id.in.(${emailIds.join(',')})`)
            .not('storage_path', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10)
        : supabase
            .from('assets')
            .select('id, filename, likely_type, storage_path')
            .eq('room_id', roomId)
            .not('storage_path', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const threadHistory = threadResult.data ?? []
    const allJobs = jobsResult.data ?? []
    const connectedSet = new Set(connectedAddresses)

    // Jobs where the user is the owner (their court)
    const openLoops = allJobs.filter((j) => j.owner != null && connectedSet.has(j.owner))
    const assets = (assetsResult.data ?? []).filter((a) => a.storage_path != null)

    // Flatten facts from room_data JSONB. Same structure as flattenFacts in room-realtime.tsx.
    const roomData = (roomResult.data?.room_data ?? {}) as Record<string, unknown>
    const facts: Array<{ key: string; value: string }> = []
    outer: for (const [, keys] of Object.entries(roomData)) {
      if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
      for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
        if (typeof stored !== 'object' || stored === null) continue
        const sf = stored as { value?: unknown }
        if (typeof sf.value === 'string') {
          facts.push({ key, value: sf.value })
          if (facts.length >= 5) break outer
        }
      }
    }

    const userMessage = [
      `Email to reply to (from ${email.from_address}):`,
      email.body_text ?? '(no body)',
      threadHistory.length > 0
        ? `\nRecent thread context:\n${threadHistory
            .map((e) => `[${e.from_address}]: ${(e.body_text ?? '').slice(0, 300)}`)
            .join('\n\n')}`
        : '',
      openLoops.length > 0
        ? `\nOpen items on your side:\n${openLoops
            .map((j) => `- ${j.description}${j.due ? ` (due ${j.due})` : ''}`)
            .join('\n')}`
        : '',
      facts.length > 0
        ? `\nKey project facts:\n${facts.map((f) => `- ${f.key}: ${f.value}`).join('\n')}`
        : '',
      assets.length > 0
        ? `\nAvailable assets in this room:\n${assets
            .map((a) => `- ${a.filename} (${a.likely_type ?? 'file'})`)
            .join('\n')}`
        : '',
      `\nWrite a reply to ${email.from_address}:`,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: REPLY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const firstBlock = response.content[0]
    if (firstBlock?.type !== 'text') return ''
    return firstBlock.text.trim()
  } catch {
    return ''
  }
}

// Returns the 10 most recent assets in a room that have a storage path.
// Used to populate the asset chips row in the compose area.
export async function getRoomAssetsForCompose(roomId: string): Promise<ComposeAsset[]> {
  try {
    const supabase = await createClient()

    const { data: emailIds } = await supabase
      .from('room_emails')
      .select('email_id')
      .eq('room_id', roomId)

    const ids = (emailIds ?? []).map((r) => r.email_id)

    let query = supabase
      .from('assets')
      .select('id, filename, storage_path')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)

    if (ids.length > 0) {
      query = query.or(`room_id.eq.${roomId},email_id.in.(${ids.join(',')})`)
    } else {
      query = query.eq('room_id', roomId)
    }

    const { data } = await query

    return (data ?? [])
      .filter((a): a is typeof a & { storage_path: string } => a.storage_path != null)
      .map((a) => ({ id: a.id, filename: a.filename, storage_path: a.storage_path }))
  } catch {
    return []
  }
}
