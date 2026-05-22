import { createAdminClient } from '@/lib/supabase/admin'
import type { Email } from '@/lib/types/database'

const MAX_OPEN_JOBS = 30

export interface ContextJob {
  id: string
  intent: string
  description: string
  owner: string | null
  due: string | null
  source: 'thread' | 'room' | 'semantic'
}

export interface ReconciliationContext {
  thread: Array<{
    from: string
    received_at: string
    subject: string | null
    body_text: string | null
  }>
  rooms: string[]
  facts: Record<string, unknown>
  openJobs: ContextJob[]
  connectedAddress: string | null
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

      for (const sibling of siblings) {
        threadEmails.push({
          from: sibling.from_name
            ? `${sibling.from_name} <${sibling.from_address}>`
            : sibling.from_address,
          received_at: sibling.received_at,
          subject: sibling.subject,
          body_text: sibling.body_text,
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

  // Workspace room names: used by the model for room_suggestions.
  const { data: allRooms } = await supabase
    .from('rooms')
    .select('name')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)

  const allRoomNames = (allRooms ?? []).map((r) => r.name)

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

  return {
    thread: threadEmails,
    rooms: allRoomNames,
    facts: mergedFacts,
    openJobs,
    connectedAddress,
  }
}
