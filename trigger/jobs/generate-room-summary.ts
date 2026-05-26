import { task } from '@trigger.dev/sdk/v3'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROOM_SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface GenerateRoomSummaryPayload {
  roomId: string
}

// Generates a 2 to 3 sentence plain-prose summary of a room and persists it.
// Enqueued by synthesise-room after a new email is processed into the room.
// Skipped when the room has no emails yet (no meaningful read model to summarise).
export const generateRoomSummaryTask = task({
  id: 'generate-room-summary',
  maxDuration: 60,
  run: async (payload: GenerateRoomSummaryPayload) => {
    const { roomId } = payload
    const supabase = createAdminClient()
    const startedAt = Date.now()

    // Fetch room name and workspace (including the user's receiving address for summary orientation).
    const { data: room } = await supabase
      .from('rooms')
      .select('name, workspace_id, room_data, workspaces(receiving_address)')
      .eq('id', roomId)
      .single()

    if (!room) {
      console.log(`generate-room-summary: room ${roomId} not found, skipping`)
      return { roomId, skipped: true }
    }

    // Fetch email IDs for this room.
    const { data: roomEmails } = await supabase
      .from('room_emails')
      .select('email_id')
      .eq('room_id', roomId)

    const emailIds = (roomEmails ?? []).map((r) => r.email_id)

    if (emailIds.length === 0) {
      console.log(`generate-room-summary: room ${roomId} has no emails, skipping`)
      return { roomId, skipped: true }
    }

    // Fetch open jobs for the room.
    const { data: jobs } = await supabase
      .from('jobs')
      .select('description, intent, owner, due, status')
      .in('email_id', emailIds)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(10)

    // Fetch sender addresses from room emails to identify key contacts.
    const { data: emails } = await supabase
      .from('emails')
      .select('from_address')
      .in('id', emailIds)

    const senderAddresses = [...new Set((emails ?? []).map((e) => e.from_address))]

    // Fetch contacts matching those senders.
    const { data: contacts } = await supabase
      .from('contacts')
      .select('name, email_address, role, organisation')
      .eq('workspace_id', room.workspace_id)
      .in('email_address', senderAddresses)
      .limit(10)

    // Flatten key facts from room_data (time, money, credential, place kinds prioritised).
    const roomData = (room.room_data ?? {}) as Record<string, unknown>
    const facts: Array<{ key: string; value: string; kind: string }> = []
    const priorityKinds = new Set(['time', 'money', 'credential', 'place'])

    for (const [, keys] of Object.entries(roomData)) {
      if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
      for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
        if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
        const sf = stored as { value: unknown; kind?: string }
        if (typeof sf.value !== 'string') continue
        if (facts.length < 10) {
          facts.push({ key, value: sf.value, kind: typeof sf.kind === 'string' ? sf.kind : 'other' })
        }
      }
    }

    // Sort so priority kinds come first.
    facts.sort((a, b) => {
      const ap = priorityKinds.has(a.kind) ? 0 : 1
      const bp = priorityKinds.has(b.kind) ? 0 : 1
      return ap - bp
    })

    // If there is nothing to summarise, skip.
    const openJobs = jobs ?? []
    if (openJobs.length === 0 && facts.length === 0 && (contacts ?? []).length === 0) {
      console.log(`generate-room-summary: room ${roomId} has no meaningful data, skipping`)
      return { roomId, skipped: true }
    }

    const workspace = Array.isArray(room.workspaces) ? room.workspaces[0] : room.workspaces
    const userEmail = workspace?.receiving_address ?? null

    const input = JSON.stringify({
      roomName: room.name,
      userEmail,
      openJobs: openJobs.map((j) => ({
        description: j.description,
        intent: j.intent,
        owner: j.owner,
        due: j.due,
      })),
      facts: facts.slice(0, 10),
      contacts: (contacts ?? []).map((c) => ({
        name: c.name,
        email: c.email_address,
        role: c.role,
        organisation: c.organisation,
      })),
    })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: ROOM_SUMMARY_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: input }],
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error(`generate-room-summary: no text block returned for room ${roomId}`)
      return { roomId, skipped: true }
    }

    const summary = textBlock.text.trim()

    const now = new Date().toISOString()

    await supabase
      .from('rooms')
      .update({
        room_summary: summary,
        room_summary_updated_at: now,
      })
      .eq('id', roomId)

    console.log(
      `generate-room-summary: wrote summary for room ${roomId} in ${Date.now() - startedAt}ms`,
    )

    return { roomId, skipped: false, durationMs: Date.now() - startedAt }
  },
})
