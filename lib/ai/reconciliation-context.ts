import { createAdminClient } from '@/lib/supabase/admin'
import type { Email } from '@/lib/types/database'
import type { RoomRecord } from '@/lib/rooms/tree'

const MAX_OPEN_JOBS = 30

export interface ContextJob {
  id: string
  intent: string
  description: string
  owner: string | null
  due: string | null
  source: 'thread' | 'room' | 'semantic'
}

// Candidate rooms matched via watch context (Layer 4).
// These are rooms Matt created before any email thread existed.
export interface WatchContextCandidate {
  roomId: string
  roomName: string
  matchReason: 'watch_context'
}

export interface ReconciliationContext {
  thread: Array<{
    from: string
    received_at: string
    subject: string | null
    body_text: string | null
    // Extracted text from attachments on this thread email (PDF, DOCX, etc.)
    attachmentTexts: Array<{ filename: string; text: string }>
  }>
  // Full room records (id, name, parent_room_id) so tier3 can render the hierarchy tree.
  rooms: RoomRecord[]
  facts: Record<string, unknown>
  openJobs: ContextJob[]
  connectedAddress: string | null
  // Rooms matched via watch context (Layer 4). Present when the sender's address
  // appears in a proactively-seeded room's watch_context.contacts.
  watchContextCandidates: WatchContextCandidate[]
}

export async function getReconciliationContext(
  email: Email,
  embedding?: number[],
): Promise<ReconciliationContext> {
  const supabase = createAdminClient()
  const workspaceId = email.workspace_id

  const threadJobs: ContextJob[] = []
  const threadEmails: ReconciliationContext['thread'] = []
  let threadEmailIds: string[] = []

  // Layer 1: Thread. All open jobs whose source email shares this thread_id.
  // Also gather prior emails in the thread for context (oldest first).
  if (email.thread_id) {
    const { data: siblings } = await supabase
      .from('emails')
      .select('id, from_address, from_name, received_at, subject, body_text')
      .eq('workspace_id', workspaceId)
      .eq('thread_id', email.thread_id)
      .neq('id', email.id)
      .order('received_at', { ascending: true })

    if (siblings && siblings.length > 0) {
      threadEmailIds = siblings.map((s) => s.id)

      // Load any extracted attachment text for thread siblings.
      // Grouped by email_id so we can join them to each thread email entry.
      const { data: siblingAssets } = await supabase
        .from('assets')
        .select('email_id, filename, extracted_text')
        .in('email_id', threadEmailIds)
        .not('extracted_text', 'is', null)

      const assetsByEmailId = new Map<string, Array<{ filename: string; text: string }>>()
      for (const asset of siblingAssets ?? []) {
        if (!asset.extracted_text || !asset.email_id) continue
        const existing = assetsByEmailId.get(asset.email_id) ?? []
        existing.push({ filename: asset.filename, text: asset.extracted_text })
        assetsByEmailId.set(asset.email_id, existing)
      }

      for (const sibling of siblings) {
        threadEmails.push({
          from: sibling.from_name
            ? `${sibling.from_name} <${sibling.from_address}>`
            : sibling.from_address,
          received_at: sibling.received_at,
          subject: sibling.subject,
          body_text: sibling.body_text,
          attachmentTexts: assetsByEmailId.get(sibling.id) ?? [],
        })
      }

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, intent, description, owner, due')
        .in('email_id', threadEmailIds)
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      for (const job of jobs ?? []) {
        threadJobs.push({ ...job, source: 'thread' as const })
      }
    }
  }

  // Layer 2: Room. Resolve the email's likely rooms from its thread siblings,
  // then add open jobs from those rooms and merge their room_data into facts.
  const roomJobs: ContextJob[] = []
  let mergedFacts: Record<string, unknown> = {}

  if (threadEmailIds.length > 0) {
    const { data: roomLinks } = await supabase
      .from('room_emails')
      .select('room_id')
      .in('email_id', threadEmailIds)

    const roomIds = [...new Set((roomLinks ?? []).map((r) => r.room_id))]

    if (roomIds.length > 0) {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, name, room_data')
        .in('id', roomIds)
        .is('archived_at', null)

      for (const room of rooms ?? []) {
        if (room.room_data && typeof room.room_data === 'object') {
          mergedFacts = { ...mergedFacts, ...(room.room_data as Record<string, unknown>) }
        }
      }

      const { data: roomEmailLinks } = await supabase
        .from('room_emails')
        .select('email_id')
        .in('room_id', roomIds)

      const threadIdSet = new Set(threadEmailIds)
      const roomOnlyEmailIds = [...new Set(
        (roomEmailLinks ?? [])
          .map((r) => r.email_id)
          .filter((id) => !threadIdSet.has(id) && id !== email.id),
      )]

      if (roomOnlyEmailIds.length > 0) {
        const existingIds = new Set(threadJobs.map((j) => j.id))

        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, intent, description, owner, due')
          .in('email_id', roomOnlyEmailIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        for (const job of jobs ?? []) {
          if (!existingIds.has(job.id)) {
            roomJobs.push({ ...job, source: 'room' as const })
          }
        }
      }
    }
  }

  // Full room records: used by tier3 to render the hierarchy tree for room_suggestions.
  // description is included so manually created rooms show routing hints in the tree.
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('id, name, parent_room_id, description')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)

  const allRoomRecords: RoomRecord[] = (allRooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    parent_room_id: r.parent_room_id,
    description: r.description,
  }))

  // Layer 3: Semantic. Top open jobs from emails nearest to this one by embedding.
  // Skipped without error if no embedding is available.
  const semanticJobs: ContextJob[] = []

  if (embedding && embedding.length > 0) {
    try {
      // Supabase generates vector parameters as `string` in TypeScript types.
      // The JS client serializes number[] correctly for pgvector at runtime.
      const { data: nearbyEmails } = await supabase.rpc('match_emails_for_context', {
        query_embedding: embedding as unknown as string,
        p_workspace_id: workspaceId,
        p_exclude_email_id: email.id,
        match_count: 20,
      })

      const existingIds = new Set([
        ...threadJobs.map((j) => j.id),
        ...roomJobs.map((j) => j.id),
      ])

      const threadIdSet = new Set(threadEmailIds)
      const semanticEmailIds = (nearbyEmails ?? [])
        .map((r) => r.email_id)
        .filter((id) => !threadIdSet.has(id) && id !== email.id)

      if (semanticEmailIds.length > 0) {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, intent, description, owner, due')
          .in('email_id', semanticEmailIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        for (const job of jobs ?? []) {
          if (!existingIds.has(job.id)) {
            semanticJobs.push({ ...job, source: 'semantic' as const })
          }
        }
      }
    } catch (err) {
      console.error('getReconciliationContext: semantic layer failed:', err)
    }
  }

  // Merge layers thread-first, deduplicated by id, capped at MAX_OPEN_JOBS.
  const openJobs = [...threadJobs, ...roomJobs, ...semanticJobs].slice(0, MAX_OPEN_JOBS)

  // Fetch the workspace's primary connected address so the model can attribute
  // self-commitments to the user and flag them as user-owned jobs.
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
    // Non-fatal: model will still extract, but user commitment ownership may be
    // less precise.
  }

  // Layer 4: Watch context match.
  // Find rooms where watch_context.contacts contains the sender's email address.
  // These are rooms Matt seeded in advance, expecting this sender. For a proactively
  // created room with no prior emails, layers 1-3 return nothing -- this layer
  // surfaces the room so the model can route the email correctly.
  const watchContextCandidates: WatchContextCandidate[] = []
  try {
    const senderAddress = email.from_address.toLowerCase()

    // The @> operator checks if the jsonb column contains the given value.
    // For a nested array we filter on watch_context->contacts containing the address.
    // Supabase .filter() with 'cs' (contains) works on jsonb arrays.
    const { data: watchMatches } = await supabase
      .from('rooms')
      .select('id, name, watch_context')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .filter('watch_context->contacts', 'cs', JSON.stringify([senderAddress]))
      .limit(5)

    for (const row of watchMatches ?? []) {
      // Skip rooms already in the candidate set via other layers.
      watchContextCandidates.push({
        roomId: row.id,
        roomName: row.name,
        matchReason: 'watch_context',
      })
    }
  } catch (err) {
    // Non-fatal: if watch context matching fails, degrade gracefully.
    console.error('getReconciliationContext: watch context layer failed:', err)
  }

  return {
    thread: threadEmails,
    rooms: allRoomRecords,
    facts: mergedFacts,
    openJobs,
    connectedAddress,
    watchContextCandidates,
  }
}
