import { createClient } from '@/lib/supabase/server'
import type { Room, Job, Asset, Contact, Email } from '@/lib/types/database'
import type { RoomReadModel, Fact } from './types'
import { getConnectedAddresses, buildOpenLoops } from '@/lib/jobs/open-loops'

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

  // Build from_name lookup from pre-fetched emails.
  // Jobs from older emails (outside the initial 50) will have from_name: null — acceptable.
  const fromNameMap = new Map<string, string | null>(
    emails.map((e) => [e.id, e.from_name ?? null]),
  )

  const openLoops = buildOpenLoops(jobs, fromNameMap, connectedSet)

  // Flatten room_data facts into a typed array.
  // kind defaults to 'other' for facts written before Part 2 deploys.
  const roomData = (room.room_data ?? {}) as Record<string, unknown>
  const facts: Fact[] = []

  for (const [category, keys] of Object.entries(roomData)) {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
      const sf = stored as { value: unknown; confidence?: number; kind?: string }
      if (typeof sf.value !== 'string') continue
      facts.push({
        category,
        key,
        value: sf.value,
        confidence: typeof sf.confidence === 'number' ? sf.confidence : 0,
        kind: typeof sf.kind === 'string' ? sf.kind : 'other',
      })
    }
  }

  return {
    workspaceId,
    roomId,
    openLoops,
    roomData,
    facts,
    assets,
    contacts,
    jobs,
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
