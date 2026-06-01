import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getConnectedAddresses } from '@/lib/jobs/open-loops'
import { REPLY_SUGGESTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  workspaceContext?: string | null
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

    // Do not generate a reply suggestion for the user's own sent emails.
    // If the from_address is a connected address, this is an outbound email
    // and replying to it makes no sense.
    const connectedSet = new Set(connectedAddresses)
    if (connectedSet.has(email.from_address)) return ''

    const emailIds = (roomEmailsResult.data ?? []).map((r) => r.email_id)

    // Scope open loops to the current thread only.
    // If the email has no thread_id, scope to just this email.
    // Never fall back to all room emails -- that causes jobs from
    // unrelated threads to bleed into the draft.
    let threadEmailIds: string[] = [emailId]

    if (email.thread_id) {
      const { data: threadEmails } = await supabase
        .from('emails')
        .select('id')
        .eq('thread_id', email.thread_id)
        .eq('workspace_id', workspaceId)

      if (threadEmails && threadEmails.length > 0) {
        threadEmailIds = threadEmails.map((e) => e.id)
      }
    }

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

      supabase
        .from('jobs')
        .select('description, owner, due')
        .in('email_id', threadEmailIds)
        .eq('status', 'open'),

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
    const assets = (assetsResult.data ?? []).filter((a) => a.storage_path != null)

    // Jobs where the user is the owner (their court), scoped to this thread.
    // Cap at 5, sorted by due date ascending (soonest first, nulls last).
    const openLoops = allJobs
      .filter((j) => j.owner != null && connectedSet.has(j.owner))
      .sort((a, b) => {
        if (!a.due && !b.due) return 0
        if (!a.due) return 1
        if (!b.due) return -1
        return a.due.localeCompare(b.due)
      })
      .slice(0, 5)

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
      params.workspaceContext
        ? `\nWorkspace context: ${params.workspaceContext}`
        : '',
      openLoops.length > 0
        ? `\nOpen items on your side (this thread only):\n${openLoops
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
      system: REPLY_SUGGESTION_SYSTEM_PROMPT,
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
