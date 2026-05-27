import { createClient } from '@/lib/supabase/server'
import type { Room, Job, Asset, Contact, Email } from '@/lib/types/database'
import type { RoomReadModel, RoomJob, Fact } from './types'
import { getConnectedAddresses, buildOpenLoops, groupTheirCourtByPerson } from '@/lib/jobs/open-loops'

export async function assembleReadModel(
  roomId: string,
  workspaceId: string,
  prefetched: {
    room: Room
    jobs: Job[]
    assets: Asset[]
    contacts: Contact[]
    emails: Email[]
  },
): Promise<RoomReadModel> {
  const { room, jobs, assets, contacts, emails } = prefetched

  const connectedAddresses = await getConnectedAddresses(workspaceId)
  const connectedSet = new Set(connectedAddresses)

  // Build from_name and from_address lookups seeded from pre-fetched emails.
  // Topped up below for any job email_ids not in the initial prefetch.
  // fromAddressMap is used to suppress from_name on self-sent emails (self-commitments).
  const fromNameMap = new Map<string, string | null>(
    emails.map((e) => [e.id, e.from_name ?? null]),
  )
  const fromAddressMap = new Map<string, string | null>(
    emails.map((e) => [e.id, e.from_address ?? null]),
  )

  // Fill in any job email_ids not covered by the initial email prefetch.
  // This ensures every job card shows its source sender, regardless of how many
  // emails the room has. We query only the missing ids — typically a small set.
  const prefetchedEmailIds = new Set(emails.map((e) => e.id))
  const missingEmailIds = [
    ...new Set(
      jobs
        .map((j) => j.email_id)
        .filter((id): id is string => !!id && !prefetchedEmailIds.has(id)),
    ),
  ]
  if (missingEmailIds.length > 0) {
    const supabase = await createClient()
    const { data: missingEmails } = await supabase
      .from('emails')
      .select('id, from_name, from_address')
      .in('id', missingEmailIds)
    for (const e of missingEmails ?? []) {
      fromNameMap.set(e.id, e.from_name ?? null)
      fromAddressMap.set(e.id, e.from_address ?? null)
    }
  }

  const openLoops = buildOpenLoops(jobs, fromNameMap, connectedSet, fromAddressMap)
  const theirCourtByPerson = await groupTheirCourtByPerson(workspaceId, openLoops.theirCourt)

  // All non-cancelled jobs enriched with from_name. openLoops is the ranked open subset.
  const roomJobs: RoomJob[] = jobs
    .filter((j) => j.status !== 'cancelled')
    .map((j) => ({
      id: j.id,
      intent: j.intent as RoomJob['intent'],
      description: j.description,
      owner: j.owner,
      due: j.due,
      status: j.status as RoomJob['status'],
      closed_at: j.closed_at,
      closed_by_email_id: j.closed_by_email_id,
      parent_job_id: j.parent_job_id,
      email_id: j.email_id,
      from_name: fromNameMap.get(j.email_id) ?? null,
      created_at: j.created_at,
    }))

  // Flatten room_data facts into a typed array.
  // kind defaults to 'other' for facts written before Part 2 deploys.
  const roomData = (room.room_data ?? {}) as Record<string, unknown>
  const facts: Fact[] = []

  for (const [category, keys] of Object.entries(roomData)) {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
      const sf = stored as { value: unknown; confidence?: number; kind?: string; email_id?: string }
      if (typeof sf.value !== 'string') continue
      facts.push({
        category,
        key,
        value: sf.value,
        confidence: typeof sf.confidence === 'number' ? sf.confidence : 0,
        kind: typeof sf.kind === 'string' ? sf.kind : 'other',
        email_id: typeof sf.email_id === 'string' ? sf.email_id : null,
      })
    }
  }

  return {
    workspaceId,
    roomId,
    openLoops,
    theirCourtByPerson,
    roomData,
    facts,
    assets,
    contacts,
    jobs: roomJobs,
    connectedAddresses,
  }
}

// Fetches the room_blocks rows for a room.
export async function getRoomBlocks(roomId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('room_blocks')
    .select('*')
    .eq('room_id', roomId)
  return data ?? []
}
