import { createClient } from '@/lib/supabase/server'
import type { Job } from '@/lib/types/database'
import { groupAddressesByPerson } from '@/lib/contacts/identity'

export interface OpenLoop extends Job {
  age_days: number
  from_name: string | null
}

export interface OpenLoops {
  yourCourt: OpenLoop[]
  theirCourt: OpenLoop[]
}

// One person's slice of the awaiting-others list.
export interface OwnerGroup {
  // identityId for merged contacts, lowercased address for singletons,
  // or '__unassigned__' for loops with owner = null.
  personKey: string
  name: string | null
  // First known address for this person, used as display fallback when name is null.
  displayAddress: string | null
  loops: OpenLoop[]
  // Maximum age_days across the group's loops, used for inter-group ordering.
  oldestAge: number
}

export async function getConnectedAddresses(workspaceId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)
  return (data ?? []).map((r) => r.email_address)
}

// Pure function: builds OpenLoops from pre-fetched jobs, an email->from_name map,
// and the set of connected addresses. No DB calls. Safe to call on client or server.
export function buildOpenLoops(
  jobs: Job[],
  fromNameMap: Map<string, string | null>,
  connectedAddresses: Set<string>,
): OpenLoops {
  const now = new Date()

  const openLoops: OpenLoop[] = jobs
    .filter((j) => j.status === 'open')
    .map((job) => {
      const createdAt = new Date(job.created_at)
      const age_days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      return {
        ...job,
        age_days,
        from_name: fromNameMap.get(job.email_id) ?? null,
      }
    })
    // Oldest first
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const yourCourt = openLoops.filter((l) => l.owner != null && connectedAddresses.has(l.owner))
  const theirCourt = openLoops.filter((l) => l.owner == null || !connectedAddresses.has(l.owner))

  return { yourCourt, theirCourt }
}

// Groups the awaiting-others loops by person, resolving identities via the DB.
// Requires server context. Called from assembleReadModel only — never from
// the client realtime path, which uses buildOpenLoops directly.
export async function groupTheirCourtByPerson(
  workspaceId: string,
  theirCourt: OpenLoop[],
): Promise<OwnerGroup[]> {
  if (theirCourt.length === 0) return []

  const ownerAddresses = theirCourt
    .map((l) => l.owner)
    .filter((o): o is string => o !== null)

  const personMap = await groupAddressesByPerson(workspaceId, ownerAddresses)

  // Build a reverse index: address -> person key, covering all addresses per identity.
  // This lets us map any address to the correct group even when two addresses share an identity.
  const addressToPersonKey = new Map<string, string>()
  for (const [personKey, person] of personMap) {
    if (personKey === null) continue
    for (const addr of person.addresses) {
      addressToPersonKey.set(addr.toLowerCase(), personKey)
    }
  }

  // Accumulate groups.
  const groupMap = new Map<
    string,
    { name: string | null; displayAddress: string | null; loops: OpenLoop[] }
  >()

  for (const loop of theirCourt) {
    if (loop.owner === null) {
      const g = groupMap.get('__unassigned__') ?? { name: null, displayAddress: null, loops: [] }
      g.loops.push(loop)
      groupMap.set('__unassigned__', g)
      continue
    }

    const addrLower = loop.owner.toLowerCase()
    const personKey = addressToPersonKey.get(addrLower) ?? addrLower
    const person = personMap.get(personKey)

    const existing = groupMap.get(personKey)
    if (existing) {
      existing.loops.push(loop)
    } else {
      groupMap.set(personKey, {
        name: person?.name ?? null,
        displayAddress: person?.addresses[0] ?? addrLower,
        loops: [loop],
      })
    }
  }

  // Build result array. All non-unassigned groups sorted by oldest loop descending.
  const result: OwnerGroup[] = []

  for (const [personKey, group] of groupMap) {
    if (personKey === '__unassigned__') continue
    const sortedLoops = group.loops.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    result.push({
      personKey,
      name: group.name,
      displayAddress: group.displayAddress,
      loops: sortedLoops,
      oldestAge: Math.max(...sortedLoops.map((l) => l.age_days)),
    })
  }

  result.sort((a, b) => b.oldestAge - a.oldestAge)

  // Unassigned group always last.
  const unassigned = groupMap.get('__unassigned__')
  if (unassigned) {
    const sortedLoops = unassigned.loops.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    result.push({
      personKey: '__unassigned__',
      name: null,
      displayAddress: null,
      loops: sortedLoops,
      oldestAge: Math.max(...sortedLoops.map((l) => l.age_days)),
    })
  }

  return result
}
