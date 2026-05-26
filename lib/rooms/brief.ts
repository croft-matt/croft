import type { OpenLoops, OpenLoop, OwnerGroup } from '@/lib/jobs/open-loops'
import type { RoomDates } from '@/lib/rooms/dates'

export interface BriefAnchor {
  // The model's own label for the delivery date, shown verbatim. Never injected.
  label: string
  // ISO date string (YYYY-MM-DD).
  date: string
}

export interface BriefTheirCourtGroup {
  personKey: string
  name: string | null
  displayAddress: string | null
  loops: OpenLoop[]
  // Days since the oldest loop in this group was created.
  longestSilenceDays: number
}

export interface AnticipatedItem {
  description: string
  // kind is not currently on the OpenLoop type; set to null for v1.
  kind: null
  jobId: string
}

export interface BriefData {
  anchor: BriefAnchor | null
  status: string | null
  yourCourt: OpenLoop[]
  theirCourt: BriefTheirCourtGroup[]
  whatsComing: AnticipatedItem[]
}

export function assembleBrief(params: {
  openLoops: OpenLoops
  ownerGroups: OwnerGroup[]
  roomDates: RoomDates
  roomStatus: string | null
}): BriefData {
  const { openLoops, ownerGroups, roomDates, roomStatus } = params

  // Anchor: derived from the delivery date produced by assembleDates.
  const anchor: BriefAnchor | null = roomDates.deliveryDate
    ? { label: roomDates.deliveryDate.label, date: roomDates.deliveryDate.value }
    : null

  // Your court: awaiting-you loops with source 'extracted' only.
  const yourCourt = openLoops.yourCourt.filter((l) => l.source !== 'anticipated')

  // Their court: awaiting-others loops with source 'extracted', grouped by person.
  const extractedTheirCourt = openLoops.theirCourt.filter((l) => l.source !== 'anticipated')
  const theirCourt = groupTheirCourt(extractedTheirCourt, ownerGroups)

  // What's coming: anticipated jobs from both sides, combined and deduplicated by id.
  const seen = new Set<string>()
  const whatsComing: AnticipatedItem[] = []
  for (const loop of [...openLoops.yourCourt, ...openLoops.theirCourt]) {
    if (loop.source !== 'anticipated') continue
    if (seen.has(loop.id)) continue
    seen.add(loop.id)
    whatsComing.push({ description: loop.description, kind: null, jobId: loop.id })
  }

  return { anchor, status: roomStatus, yourCourt, theirCourt, whatsComing }
}

// Groups extracted their-court loops by person using the ownerGroups identity data.
// Unassigned loops (personKey === '__unassigned__') are excluded from the Brief.
function groupTheirCourt(
  loops: OpenLoop[],
  ownerGroups: OwnerGroup[],
): BriefTheirCourtGroup[] {
  if (loops.length === 0) return []

  // Build address -> personKey from the already-resolved ownerGroups.
  const addressToPersonKey = new Map<string, string>()
  for (const group of ownerGroups) {
    for (const loop of group.loops) {
      if (loop.owner) {
        addressToPersonKey.set(loop.owner.toLowerCase(), group.personKey)
      }
    }
  }

  const personMeta = new Map<string, { name: string | null; displayAddress: string | null }>(
    ownerGroups.map((g) => [g.personKey, { name: g.name, displayAddress: g.displayAddress }]),
  )

  const groupMap = new Map<string, OpenLoop[]>()

  for (const loop of loops) {
    if (loop.owner === null) continue // omit unassigned
    const personKey = addressToPersonKey.get(loop.owner.toLowerCase()) ?? loop.owner.toLowerCase()
    if (personKey === '__unassigned__') continue
    const existing = groupMap.get(personKey) ?? []
    existing.push(loop)
    groupMap.set(personKey, existing)
  }

  const result: BriefTheirCourtGroup[] = []

  for (const [personKey, groupLoops] of groupMap) {
    const meta = personMeta.get(personKey)
    const sortedLoops = [...groupLoops].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const longestSilenceDays = Math.max(...sortedLoops.map((l) => l.age_days))
    result.push({
      personKey,
      name: meta?.name ?? null,
      displayAddress: meta?.displayAddress ?? groupLoops[0]?.owner ?? null,
      loops: sortedLoops,
      longestSilenceDays,
    })
  }

  // Sort by longest silence descending so the most overdue wait is at the top.
  result.sort((a, b) => b.longestSilenceDays - a.longestSilenceDays)

  return result
}
