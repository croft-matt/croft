// Handles direct emails from Matt to Croft's inbound address (source = 'user_direct').
// Two intents are possible:
//   Room creation: no room URL in body -- this file handles it (Brief 38).
//   Command:       room URL present -- Brief 39 handles it.
//
// handleProactiveCreation:
//   1. Fetch body.
//   2. Call the proactive creation prompt (Haiku -- low cost, no caching needed).
//   3. For single room: create room, file email, write seed facts, set watch_context, create anticipated jobs.
//   4. For batch: create parent room, then children. Parent watch_context = union of children.
//   5. Mark email processed.
//
// handleCommand (Brief 39):
//   1. Resolve room from URL in body.
//   2. Classify command via Haiku (remove, merge, rename, archive, unclear).
//   3. Execute the operation and send a plain-text confirmation reply via Resend.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAndStoreEmailBody } from '@/lib/email/fetch-body'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import { sendConfirmation } from '@/lib/email/confirmation'
import { tasks } from '@trigger.dev/sdk/v3'
import type { synthesiseRoomTask } from '@/trigger/jobs/synthesise-room'
import type { Json } from '@/lib/types/database'
import {
  PROACTIVE_CREATION_SYSTEM_PROMPT,
  PROACTIVE_CREATION_TOOL_SCHEMA,
  buildProactiveCreationContent,
  COMMAND_CLASSIFICATION_SYSTEM_PROMPT,
  COMMAND_CLASSIFICATION_TOOL_SCHEMA,
  type ProactiveCreationOutput,
  type ProactiveRoom,
  type WatchContext,
  type CommandClassificationOutput,
} from '@/lib/ai/prompts-first-party'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROOM_URL_PATTERN = /yourcroft\.com\/rooms\/([a-zA-Z0-9-]+)/

export function containsRoomLink(body: string): boolean {
  return ROOM_URL_PATTERN.test(body)
}

export function extractRoomId(body: string): string | null {
  const match = body.match(ROOM_URL_PATTERN)
  return match ? match[1] : null
}

export async function handleProactiveCreation(
  emailId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createAdminClient()

  await supabase.from('emails').update({ processing_state: 'processing' }).eq('id', emailId)

  try {
    await fetchAndStoreEmailBody(emailId)

    const { data: email } = await supabase.from('emails').select('*').eq('id', emailId).single()
    if (!email) throw new Error(`handleProactiveCreation: email ${emailId} not found`)

    const body = email.body_text ?? ''
    const userContent = buildProactiveCreationContent(body, email.subject)

    // Use Haiku -- this is a structured extraction with a small prompt.
    // Proactive creation emails are low-frequency so caching is not relevant.
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: PROACTIVE_CREATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      tools: [PROACTIVE_CREATION_TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'create_proactive_rooms' },
    })

    let parsed: ProactiveCreationOutput | null = null
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'create_proactive_rooms') {
        parsed = block.input as ProactiveCreationOutput
        break
      }
    }

    if (!parsed || parsed.rooms.length === 0) {
      console.warn(`[first-party-direct] no rooms extracted from email ${emailId}`)
      await supabase
        .from('emails')
        .update({ processing_state: 'processed', processed_at: new Date().toISOString() })
        .eq('id', emailId)
      return
    }

    const { rooms } = parsed

    // Determine whether this is a batch: any room has a parent_name.
    const isBatch = rooms.some((r) => r.parent_name != null)

    if (isBatch) {
      await createBatchRooms(rooms, emailId, workspaceId)
    } else {
      for (const room of rooms) {
        await createSingleRoom(room, emailId, workspaceId)
      }
    }

    // Mark direct email as processed. subject_summary is the email's own subject.
    await supabase
      .from('emails')
      .update({
        processing_state: 'processed',
        subject_summary: email.subject ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)
  } catch (err) {
    await supabase.from('emails').update({ processing_state: 'failed' }).eq('id', emailId)
    throw err
  }
}

// Creates a single room (no parent relationship).
async function createSingleRoom(
  room: ProactiveRoom,
  emailId: string,
  workspaceId: string,
): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const seedFacts = buildRoomData(room, emailId)

  const { data: created, error } = await supabase
    .from('rooms')
    .insert({
      workspace_id: workspaceId,
      name: room.name,
      parent_room_id: null,
      room_data: seedFacts,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`[first-party-direct] room insert failed: ${error?.message ?? 'no data'}`)
  }

  const roomId = created.id

  // Patch columns not yet in generated types (watch_context, created_from_email_id).
  // Cast required until types are regenerated after migration runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from('rooms').update({ watch_context: room.watch_context, created_from_email_id: emailId } as any).eq('id', roomId)

  // File the direct email into the room so its jobs are retrievable by room query.
  await supabase
    .from('room_emails')
    .upsert(
      { room_id: roomId, email_id: emailId, source: 'user_direct' },
      { onConflict: 'room_id,email_id', ignoreDuplicates: true },
    )

  await createAnticipatedJobs(room.watch_context, roomId, emailId, workspaceId)

  await upsertWatchContacts(room.watch_context.contacts, workspaceId)

  broadcastRoomCreated(workspaceId).catch((err: unknown) =>
    console.error('[first-party-direct] room_created broadcast failed:', err),
  )

  return roomId
}

// Creates a parent room and N child rooms for a batch email.
// Parent watch_context = union of all children.
async function createBatchRooms(
  rooms: ProactiveRoom[],
  emailId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Group children by parent_name. A room without parent_name is the parent itself.
  // The model may return the parent as a room with no parent_name, or we derive the
  // parent name from the children's parent_name field. Handle both cases.
  const parentNames = new Set(
    rooms.filter((r) => r.parent_name != null).map((r) => r.parent_name as string),
  )

  for (const parentName of parentNames) {
    const children = rooms.filter((r) => r.parent_name === parentName)
    // The model may include an explicit parent room entry or not.
    const explicitParent = rooms.find((r) => r.name === parentName && r.parent_name == null)

    // Union watch context from all children.
    const unionedWatchContext = unionWatchContexts(children.map((c) => c.watch_context))

    const parentRoomData = explicitParent
      ? buildRoomData(explicitParent, emailId)
      : {}

    const { data: parentRoom, error: parentError } = await supabase
      .from('rooms')
      .insert({
        workspace_id: workspaceId,
        name: parentName,
        parent_room_id: null,
        room_data: parentRoomData,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (parentError || !parentRoom) {
      throw new Error(
        `[first-party-direct] parent room insert failed: ${parentError?.message ?? 'no data'}`,
      )
    }

    const parentRoomId = parentRoom.id

    // Patch columns not yet in generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('rooms').update({ watch_context: unionedWatchContext, created_from_email_id: emailId } as any).eq('id', parentRoomId)

    await supabase
      .from('room_emails')
      .upsert(
        { room_id: parentRoomId, email_id: emailId, source: 'user_direct' },
        { onConflict: 'room_id,email_id', ignoreDuplicates: true },
      )

    for (const child of children) {
      const childRoomData = buildRoomData(child, emailId)

      const { data: childRoom, error: childError } = await supabase
        .from('rooms')
        .insert({
          workspace_id: workspaceId,
          name: child.name,
          parent_room_id: parentRoomId,
          room_data: childRoomData,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()

      if (childError || !childRoom) {
        console.error(
          `[first-party-direct] child room insert failed for "${child.name}":`,
          childError?.message,
        )
        continue
      }

      const childRoomId = childRoom.id

      // Patch columns not yet in generated types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('rooms').update({ watch_context: child.watch_context, created_from_email_id: emailId } as any).eq('id', childRoomId)

      await supabase
        .from('room_emails')
        .upsert(
          { room_id: childRoomId, email_id: emailId, source: 'user_direct' },
          { onConflict: 'room_id,email_id', ignoreDuplicates: true },
        )

      await createAnticipatedJobs(child.watch_context, childRoomId, emailId, workspaceId)
      await upsertWatchContacts(child.watch_context.contacts, workspaceId)
    }

    broadcastRoomCreated(workspaceId).catch((err: unknown) =>
      console.error('[first-party-direct] room_created broadcast failed:', err),
    )
  }

  // Rooms that have no parent_name and whose name does not appear as any child's parent_name
  // are standalone rooms -- create them separately.
  const standaloneRooms = rooms.filter(
    (r) => r.parent_name == null && !parentNames.has(r.name),
  )
  for (const room of standaloneRooms) {
    await createSingleRoom(room, emailId, workspaceId)
  }
}

// Converts a room's seed_facts into the room_data JSONB shape.
// room_data is keyed by category ('general' for facts with no explicit category),
// then by key, using the same StoredFact shape as synthesise.ts.
function buildRoomData(
  room: ProactiveRoom,
  emailId: string,
): Json {
  const now = new Date().toISOString()
  const result: Record<string, Record<string, Json>> = {}

  for (const fact of room.seed_facts) {
    // Derive a category from the kind so facts group sensibly in the UI.
    const category =
      fact.kind === 'place'
        ? 'location'
        : fact.kind === 'time'
          ? 'schedule'
          : fact.kind === 'money'
            ? 'financials'
            : fact.kind === 'credential'
              ? 'credentials'
              : fact.kind === 'spec'
                ? 'specifications'
                : 'general'

    if (!result[category]) {
      result[category] = {}
    }

    result[category][fact.key] = {
      value: fact.value,
      confidence: fact.confidence,
      updated_at: now,
      kind: fact.kind,
      email_id: emailId,
    }
  }

  return result
}

// Creates one anticipated job per watch_context.anticipated item.
// email_id is set to the user's direct email (the email that caused this room to be created).
// source = 'anticipated' distinguishes these from email-extracted jobs.
async function createAnticipatedJobs(
  watchContext: WatchContext,
  roomId: string,
  emailId: string,
  workspaceId: string,
): Promise<void> {
  if (watchContext.anticipated.length === 0) return

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Jobs link to rooms via email_id -> room_emails. The direct email is filed into
  // the room in the caller, so these jobs will surface when querying by room.
  const jobRows = watchContext.anticipated.map((item) => ({
    workspace_id: workspaceId,
    email_id: emailId,
    intent: 'REQUEST' as const,
    description: item.description,
    owner: null,
    due: null,
    confidence: 1,
    status: 'open' as const,
    source: 'anticipated' as const,
    created_at: now,
    updated_at: now,
  }))

  // Insert individually so one failure does not drop the whole batch.
  for (const row of jobRows) {
    const { error } = await supabase.from('jobs').insert(row)
    if (error) {
      console.error(
        `[first-party-direct] anticipated job insert failed for room ${roomId}:`,
        error.message,
      )
    }
  }
}

// Upserts contacts that have a valid email address.
// Plain names without addresses are stored in watch_context only -- no contact row.
async function upsertWatchContacts(contacts: string[], workspaceId: string): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  for (const contact of contacts) {
    // A basic email address check: must contain @ and at least one dot after it.
    if (!contact.includes('@')) continue

    const { error } = await supabase
      .from('contacts')
      .upsert(
        {
          workspace_id: workspaceId,
          email_address: contact.toLowerCase(),
          name: null,
          role: null,
          last_seen_at: now,
        },
        { onConflict: 'workspace_id,email_address', ignoreDuplicates: false },
      )

    if (error) {
      console.error(
        `[first-party-direct] contact upsert failed for ${contact}:`,
        error.message,
      )
    }
  }
}

// Returns a WatchContext that is the union of all provided contexts.
// Duplicates in contacts and keywords are removed.
function unionWatchContexts(contexts: WatchContext[]): WatchContext {
  const contacts = [...new Set(contexts.flatMap((c) => c.contacts))]
  const keywords = [...new Set(contexts.flatMap((c) => c.keywords))]
  // Anticipated items: deduplicate by description.
  const seenDescriptions = new Set<string>()
  const anticipated: WatchContext['anticipated'] = []
  for (const ctx of contexts) {
    for (const item of ctx.anticipated) {
      if (!seenDescriptions.has(item.description)) {
        seenDescriptions.add(item.description)
        anticipated.push(item)
      }
    }
  }
  return { contacts, keywords, anticipated }
}

async function broadcastRoomCreated(workspaceId: string): Promise<void> {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)

  await broadcastToWorkspace(workspaceId, 'room_created', { count: count ?? 0 })
}

// --- Brief 39: Command handling ---
//
// A room command email contains a yourcroft.com/rooms/ URL in the body.
// The pipeline skips tier 1/2/3 and calls handleCommand instead.
// Room status values: 'active' | 'archived' | 'deleted'.
// These require the following migration before use:
//   alter table rooms add column status text not null default 'active'
//     check (status in ('active', 'archived', 'deleted'));

// Represents the room row shape used by command functions.
// status is not yet in generated types -- cast at query call sites.
type CommandRoom = {
  id: string
  name: string
  parent_room_id: string | null
  status: string
}

// Context carried into every execute function for sending the confirmation reply.
type CommandContext = {
  workspaceId: string
  to: string
  replySubject: string
  inReplyTo: string | undefined
}

export async function handleCommand(emailId: string, workspaceId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase.from('emails').update({ processing_state: 'processing' }).eq('id', emailId)

  try {
    const { data: email } = await supabase
      .from('emails')
      .select('id, body_text, from_address, subject, message_id')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`handleCommand: email ${emailId} not found`)

    const body = email.body_text ?? ''
    const ctx: CommandContext = {
      workspaceId,
      to: email.from_address,
      replySubject: `Re: ${email.subject ?? '(no subject)'}`,
      inReplyTo: email.message_id ?? undefined,
    }

    const roomId = extractRoomId(body)
    if (!roomId) {
      // containsRoomLink was true but extractRoomId returned null -- should not happen.
      await supabase
        .from('emails')
        .update({ processing_state: 'processed', processed_at: new Date().toISOString() })
        .eq('id', emailId)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name, parent_room_id' as string)
      .eq('id', roomId)
      .eq('workspace_id', workspaceId)
      .single()

    // Fetch status separately since it may not be in generated types yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roomStatusRow } = await (supabase.from('rooms') as any)
      .select('status')
      .eq('id', roomId)
      .single()

    const room: CommandRoom | null = roomData
      ? { ...(roomData as { id: string; name: string; parent_room_id: string | null }), status: (roomStatusRow as { status?: string } | null)?.status ?? 'active' }
      : null

    if (!room) {
      await sendConfirmation({
        ...ctx,
        body: 'I could not find that room. The link may be outdated.',
      })
      await supabase
        .from('emails')
        .update({ processing_state: 'processed', processed_at: new Date().toISOString() })
        .eq('id', emailId)
      return
    }

    const parsed = await classifyCommand(body)

    switch (parsed.command) {
      case 'remove':
        await executeRemove(room, ctx, supabase)
        break
      case 'merge':
        await executeMerge(room, parsed.target_room_url, ctx, supabase)
        break
      case 'rename':
        await executeRename(room, parsed.new_name, ctx, supabase)
        break
      case 'archive':
        await executeArchive(room, ctx, supabase)
        break
      case 'unclear':
        await sendConfirmation({
          ...ctx,
          body: `I'm not sure what you'd like me to do with room '${room.name}'. Try: "remove this", "rename this to [name]", "archive this", or "merge this with [room URL]".`,
        })
        break
    }

    await supabase
      .from('emails')
      .update({ processing_state: 'processed', processed_at: new Date().toISOString() })
      .eq('id', emailId)
  } catch (err) {
    await supabase.from('emails').update({ processing_state: 'failed' }).eq('id', emailId)
    throw err
  }
}

// Calls Haiku to classify the command intent from the email body.
async function classifyCommand(body: string): Promise<CommandClassificationOutput> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: COMMAND_CLASSIFICATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: body }],
    tools: [COMMAND_CLASSIFICATION_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'classify_command' },
  })

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'classify_command') {
      return block.input as CommandClassificationOutput
    }
  }

  // Fallback: model did not return a tool use block.
  return { command: 'unclear', new_name: null, target_room_url: null }
}

// Sets status='deleted', orphans child rooms.
// No hard deletes. Emails, jobs, and facts linked to the room are preserved.
async function executeRemove(
  room: CommandRoom,
  ctx: CommandContext,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (room.status === 'deleted') {
    await sendConfirmation({ ...ctx, body: `Room '${room.name}' is already deleted.` })
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('rooms') as any)
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', room.id)

  // Orphan child rooms rather than cascade-deleting them.
  await supabase
    .from('rooms')
    .update({ parent_room_id: null })
    .eq('parent_room_id', room.id)

  await sendConfirmation({ ...ctx, body: `Done. Room '${room.name}' has been removed.` })
}

// Moves all room_emails, child rooms, and room_data from source to target.
// Source is then soft-deleted. Room synthesis re-runs on the target.
async function executeMerge(
  source: CommandRoom,
  targetRoomUrl: string | null,
  ctx: CommandContext,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (!targetRoomUrl) {
    await sendConfirmation({
      ...ctx,
      body: `To merge '${source.name}', I need the URL of the room to merge it into. Reply with: "merge this with [room URL]".`,
    })
    return
  }

  const targetId = extractRoomId(targetRoomUrl)
  if (!targetId) {
    await sendConfirmation({
      ...ctx,
      body: `I could not read the target room URL. Please include a full yourcroft.com/rooms/... link.`,
    })
    return
  }

  if (targetId === source.id) {
    await sendConfirmation({ ...ctx, body: `The source and target rooms are the same. Nothing to merge.` })
    return
  }

  // Fetch target, verifying workspace ownership.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetData } = await supabase
    .from('rooms')
    .select('id, name, room_data, parent_room_id')
    .eq('id', targetId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (!targetData) {
    await sendConfirmation({
      ...ctx,
      body: `I could not find the target room. The link may be outdated or belong to a different workspace.`,
    })
    return
  }

  // Move room_emails: upsert with target room_id, ignore duplicates that already exist.
  const { data: sourceEmails } = await supabase
    .from('room_emails')
    .select('email_id, source')
    .eq('room_id', source.id)

  for (const row of sourceEmails ?? []) {
    await supabase
      .from('room_emails')
      .upsert(
        { room_id: targetId, email_id: row.email_id, source: row.source },
        { onConflict: 'room_id,email_id', ignoreDuplicates: true },
      )
  }

  // Reparent child rooms from source to target.
  await supabase
    .from('rooms')
    .update({ parent_room_id: targetId, updated_at: new Date().toISOString() })
    .eq('parent_room_id', source.id)

  // Merge source room_data into target room_data (target facts win on key conflicts).
  const { data: sourceRoomFull } = await supabase
    .from('rooms')
    .select('room_data')
    .eq('id', source.id)
    .single()

  if (sourceRoomFull?.room_data) {
    const merged = mergeRoomData(
      (targetData.room_data ?? {}) as Record<string, unknown>,
      sourceRoomFull.room_data as Record<string, unknown>,
    )
    await supabase
      .from('rooms')
      .update({ room_data: merged as Json, updated_at: new Date().toISOString() })
      .eq('id', targetId)
  }

  // Soft-delete the source room.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('rooms') as any)
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', source.id)

  // Re-synthesise the target room to rebuild progress counters with the merged emails.
  await tasks.trigger<typeof synthesiseRoomTask>('synthesise-room', { roomId: targetId })

  await sendConfirmation({
    ...ctx,
    body: `Done. Room '${source.name}' has been merged into '${targetData.name}'.`,
  })
}

// Updates rooms.name to the new name extracted by Haiku.
async function executeRename(
  room: CommandRoom,
  newName: string | null,
  ctx: CommandContext,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (!newName || newName.trim() === '') {
    await sendConfirmation({
      ...ctx,
      body: `I could not determine the new name. Reply with: "rename to [new name]".`,
    })
    return
  }

  const trimmed = newName.trim()

  await supabase
    .from('rooms')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', room.id)

  await sendConfirmation({ ...ctx, body: `Done. Room renamed to '${trimmed}'.` })
}

// Sets status='archived'. Differs from remove: archived rooms are completed work.
async function executeArchive(
  room: CommandRoom,
  ctx: CommandContext,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (room.status === 'archived') {
    await sendConfirmation({ ...ctx, body: `Room '${room.name}' is already archived.` })
    return
  }
  if (room.status === 'deleted') {
    await sendConfirmation({ ...ctx, body: `Room '${room.name}' is already deleted.` })
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('rooms') as any)
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', room.id)

  await sendConfirmation({ ...ctx, body: `Done. Room '${room.name}' has been archived.` })
}

// Merges source room_data into target room_data.
// Target facts win on key conflicts (source fills gaps, does not overwrite).
function mergeRoomData(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }

  for (const [category, sourceFacts] of Object.entries(source)) {
    if (typeof sourceFacts !== 'object' || sourceFacts === null || Array.isArray(sourceFacts)) {
      continue
    }

    const targetFacts = result[category]
    if (typeof targetFacts === 'object' && targetFacts !== null && !Array.isArray(targetFacts)) {
      // Merge at fact level: target wins, source fills missing keys.
      result[category] = {
        ...(sourceFacts as Record<string, unknown>),
        ...(targetFacts as Record<string, unknown>),
      }
    } else {
      result[category] = sourceFacts
    }
  }

  return result
}
