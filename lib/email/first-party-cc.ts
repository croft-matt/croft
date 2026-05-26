// Handles CC-seeded emails: emails the workspace user sent with Croft in the CC field.
// Called from the process-first-party Trigger.dev job (source = 'user_cc').
//
// Flow:
//   1. Fetch body and resolve thread_id via the standard fetch-body path.
//   2. Generate and store an embedding.
//   3. Match against an existing room (thread match, then participant match).
//   4. Create a room if no match.
//   5. File the email into the room and record provenance.
//   6. Upsert counterparty contacts from the email headers.
//   7. Run first-party Tier 3 classification.
//   8. Write extraction results.
//   9. Mark the email processed and trigger room synthesis.

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAndStoreEmailBody } from '@/lib/email/fetch-body'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { runFirstPartyClassification } from '@/lib/ai/tier3'
import { writeExtractionResults } from '@/lib/email/batch'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import { buildRoomTree } from '@/lib/rooms/tree'
import { tasks } from '@trigger.dev/sdk/v3'
import type { synthesiseRoomTask } from '@/trigger/jobs/synthesise-room'
import type { AttachmentMeta } from '@/lib/types/database'
import type { Json } from '@/lib/types/database'
import type { ReconciliationContext, ContextJob } from '@/lib/ai/reconciliation-context'
import type { RoomRecord } from '@/lib/rooms/tree'

// Strips common reply/forward prefixes from a subject line while preserving casing.
// Used to derive a clean room name from the email subject.
function stripSubjectPrefixes(subject: string): string {
  let s = subject.trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^(re|fwd|fw)\s*:\s*/i, '').trim()
  }
  return s || subject.trim()
}

// Attempts to find an existing room for the CC-seeded email.
// Returns the room ID if a confident match is found, or null.
// Layer 1: thread_id match -- same thread already linked to a room.
// Layer 2: participant match -- all `to` addresses appear in an existing room's emails.
async function matchExistingRoom(
  workspaceId: string,
  threadId: string | null,
  toAddresses: string[],
): Promise<string | null> {
  const supabase = createAdminClient()

  // Layer 1: thread match
  if (threadId) {
    const { data: siblings } = await supabase
      .from('emails')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('thread_id', threadId)

    const siblingIds = (siblings ?? []).map((s) => s.id)

    if (siblingIds.length > 0) {
      const { data: links } = await supabase
        .from('room_emails')
        .select('room_id')
        .in('email_id', siblingIds)
        .limit(1)

      const roomId = links?.[0]?.room_id ?? null
      if (roomId) {
        console.log(`[first-party-cc] thread match -> room ${roomId}`)
        return roomId
      }
    }
  }

  // Layer 2: participant match
  // Find rooms that have prior emails involving all of the CC email's recipients.
  // Only attempt if there is at least one recipient to match on.
  if (toAddresses.length > 0) {
    // Collect all room IDs where these addresses appear as from_address or in to_addresses.
    const { data: matchedEmails } = await supabase
      .from('emails')
      .select('id, from_address, to_addresses')
      .eq('workspace_id', workspaceId)
      .in('from_address', toAddresses)

    const emailIds = (matchedEmails ?? []).map((e) => e.id)

    if (emailIds.length > 0) {
      const { data: links } = await supabase
        .from('room_emails')
        .select('room_id')
        .in('email_id', emailIds)

      // Count how many distinct `to` addresses appear per room.
      // A room must have all of the `to` addresses to qualify.
      const roomCounts = new Map<string, Set<string>>()
      for (const link of links ?? []) {
        if (!roomCounts.has(link.room_id)) {
          roomCounts.set(link.room_id, new Set())
        }
      }

      // Collect which `to` address matched each room via the email rows.
      for (const email of matchedEmails ?? []) {
        const { data: emailLinks } = await supabase
          .from('room_emails')
          .select('room_id')
          .eq('email_id', email.id)

        for (const link of emailLinks ?? []) {
          const set = roomCounts.get(link.room_id)
          if (set) set.add(email.from_address)
        }
      }

      const toSet = new Set(toAddresses)
      for (const [roomId, foundAddresses] of roomCounts.entries()) {
        if (toSet.size > 0 && [...toSet].every((addr) => foundAddresses.has(addr))) {
          console.log(`[first-party-cc] participant match -> room ${roomId}`)
          return roomId
        }
      }
    }
  }

  return null
}

export async function handleUserCc(
  emailId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('emails')
    .update({ processing_state: 'processing' })
    .eq('id', emailId)

  try {
    // Step 1: Fetch body and resolve thread_id.
    // fetchAndStoreEmailBody calls resend.emails.get(), reads In-Reply-To / References
    // headers, and stores body_text + thread_id on the email row.
    await fetchAndStoreEmailBody(emailId)

    // Step 2: Fetch the full email row (now includes body_text and thread_id).
    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`handleUserCc: email ${emailId} not found`)

    const toAddresses = (email.to_addresses as string[]).map((a) => a.toLowerCase())
    const ccAddresses = (email.cc_addresses as string[]).map((a) => a.toLowerCase())

    // Step 3: Generate and store embedding.
    // Non-fatal: if it fails the semantic layer in any future reconciliation is skipped.
    let embedding: number[] | undefined
    try {
      embedding = await generateEmbedding(email)
      await supabase
        .from('emails')
        .update({ embedding: embedding as unknown as string })
        .eq('id', emailId)
    } catch (err) {
      console.error(`[first-party-cc] embedding failed for ${emailId}:`, err)
    }

    // Step 4: Room matching -- thread match first, then participant match.
    let roomId = await matchExistingRoom(workspaceId, email.thread_id, toAddresses)
    const createdNewRoom = !roomId

    // Step 5: Create a room if no existing room matched.
    if (!roomId) {
      const rawSubject = email.subject ?? ''
      const roomName = stripSubjectPrefixes(rawSubject) || rawSubject || 'Untitled'
      const now = new Date().toISOString()

      const { data: newRoom, error: createError } = await supabase
        .from('rooms')
        .insert({
          workspace_id: workspaceId,
          name: roomName,
          parent_room_id: null,
          room_data: {},
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()

      if (createError || !newRoom) {
        throw new Error(
          `[first-party-cc] room creation failed: ${createError?.message ?? 'no data'}`,
        )
      }

      roomId = newRoom.id

      // Broadcast new room count so any open UI can update.
      const { count: roomCount } = await supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)

      broadcastToWorkspace(workspaceId, 'room_created', { count: roomCount ?? 0 }).catch(
        (err: unknown) =>
          console.error(`[first-party-cc] room_created broadcast failed:`, err),
      )
    }

    // Step 6: File the email into the room.
    // room_emails upsert is idempotent -- safe even if writeExtractionResults
    // later files the email again via the model's room_suggestions.
    await supabase
      .from('room_emails')
      .upsert(
        { room_id: roomId, email_id: emailId, source: 'ai' },
        { onConflict: 'room_id,email_id', ignoreDuplicates: true },
      )

    // Step 7: Record provenance on the room if we created it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // Cast required until types are regenerated after migration 20260526000002 runs.
    if (createdNewRoom) {
      await supabase
        .from('rooms')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ created_from_email_id: emailId } as any)
        .eq('id', roomId)
    }

    // Step 8: Upsert counterparty contacts from the email headers.
    // The user's own address (from_address) is the workspace owner -- skip it.
    // Also skip Croft's receiving address which appears in cc_addresses.
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('receiving_address')
      .eq('id', workspaceId)
      .single()

    const croftAddress = (workspace?.receiving_address ?? '').toLowerCase()
    const userAddress = email.from_address.toLowerCase()

    const counterpartyAddresses = [
      ...toAddresses,
      ...ccAddresses,
    ].filter(
      (addr) => addr !== croftAddress && addr !== userAddress,
    )

    const now = new Date().toISOString()

    for (const addr of counterpartyAddresses) {
      const { error: contactError } = await supabase
        .from('contacts')
        .upsert(
          {
            workspace_id: workspaceId,
            email_address: addr,
            name: null,
            role: null,
            last_seen_at: now,
          },
          {
            onConflict: 'workspace_id,email_address',
            ignoreDuplicates: false,
          },
        )

      if (contactError) {
        console.error(
          `[first-party-cc] contact upsert failed for ${addr}:`,
          contactError.message,
        )
      }
    }

    // Step 9: Build first-party classification context.
    // Includes the matched room's open jobs and facts for dedup and reconciliation.
    // Does not include cross-thread reconciliation candidates.
    const context = await buildFirstPartyContext(roomId, workspaceId)

    const candidateJobIds = new Set(context.openJobs.map((j) => j.id))

    // Step 10: Run first-party Tier 3 classification.
    // urgency_score is not set -- tier 2 is never run for CC-seeded emails.
    const result = await runFirstPartyClassification(email, context)

    // Step 11: Write extraction results (jobs, facts, contacts, assets, room filing).
    const { matchedRoomIds } = await writeExtractionResults(
      emailId,
      workspaceId,
      result.extraction,
      candidateJobIds,
      email.attachments as unknown as AttachmentMeta[],
    )

    // Step 12: Mark the email as processed.
    await supabase
      .from('emails')
      .update({
        processing_state: 'processed',
        subject_summary: result.subject_summary,
        extraction: result.extraction as unknown as Json,
        extraction_complete: result.extraction_complete,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)

    // Step 13: Trigger room synthesis for the seeded room and any additional rooms
    // the model filed the email into.
    const allRoomIds = [...new Set([roomId, ...matchedRoomIds])]

    for (const rid of allRoomIds) {
      tasks
        .trigger<typeof synthesiseRoomTask>(
          'synthesise-room',
          { roomId: rid, emailId },
          { concurrencyKey: rid },
        )
        .catch((err: unknown) =>
          console.error(
            `[first-party-cc] synthesis trigger failed for room ${rid}:`,
            err,
          ),
        )
    }
  } catch (err) {
    await supabase
      .from('emails')
      .update({ processing_state: 'failed' })
      .eq('id', emailId)

    throw err
  }
}

// Builds the ReconciliationContext for a first-party classification.
// Fetches open jobs and room_data from the matched room only.
// Does not perform cross-thread or semantic candidate retrieval.
async function buildFirstPartyContext(
  roomId: string,
  workspaceId: string,
): Promise<ReconciliationContext> {
  const supabase = createAdminClient()

  // Open jobs in the matched room (for dedup detection)
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)

  const roomEmailIds = (roomEmails ?? []).map((r) => r.email_id)
  const openJobs: ContextJob[] = []

  if (roomEmailIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, intent, description, owner, due')
      .in('email_id', roomEmailIds)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    for (const job of jobs ?? []) {
      openJobs.push({ ...job, source: 'room' as const })
    }
  }

  // Known facts from the room's room_data
  const { data: room } = await supabase
    .from('rooms')
    .select('room_data')
    .eq('id', roomId)
    .single()

  const facts: Record<string, unknown> =
    room?.room_data && typeof room.room_data === 'object'
      ? (room.room_data as Record<string, unknown>)
      : {}

  // Full room tree for room_suggestions
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('id, name, parent_room_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)

  const rooms: RoomRecord[] = (allRooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    parent_room_id: r.parent_room_id,
  }))

  // Connected address
  let connectedAddress: string | null = null
  try {
    const { data: account } = await supabase
      .from('email_accounts')
      .select('email_address')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle()
    connectedAddress = account?.email_address ?? null
  } catch {
    // Non-fatal
  }

  return {
    thread: [],
    rooms,
    facts,
    openJobs,
    connectedAddress,
  }
}
