import { createClient } from '@/lib/supabase/server'
import type { Person } from '@/lib/contacts/identity'
import { groupAddressesByPerson } from '@/lib/contacts/identity'
import { getConnectedAddresses } from '@/lib/jobs/open-loops'

export interface RoomPerson {
  person: Person
  firstEmailId: string
  firstEmailDate: string
  pendingMergeWith: string | null
  mergePartnerPersonKey: string | null
}

export interface RoomPeople {
  persons: RoomPerson[]
  pendingMerges: PendingMerge[]
}

export interface PendingMerge {
  candidateId: string
  personKeyA: string
  personKeyB: string
  signals: Record<string, boolean>
}

const EMPTY: RoomPeople = { persons: [], pendingMerges: [] }

// to_addresses and cc_addresses may be stored as RFC 2822 formatted strings
// ("Display Name <email@domain.com>") rather than bare addresses. Extract the
// actual email so we can match against contacts.email_address correctly.
function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).toLowerCase().trim()
}

export async function getRoomPeople(params: {
  workspaceId: string
  roomId: string
  emailIds?: string[]
}): Promise<RoomPeople> {
  const { workspaceId, roomId, emailIds } = params
  const supabase = await createClient()

  let ids: string[]
  if (emailIds !== undefined) {
    ids = emailIds
  } else {
    const { data: reData } = await supabase
      .from('room_emails')
      .select('email_id')
      .eq('room_id', roomId)
    ids = (reData ?? []).map((r) => r.email_id)
  }

  if (ids.length === 0) return EMPTY

  // Fetch email rows with the fields needed to collect addresses and citations.
  // Order ascending so we can walk them in chronological order for first-email detection.
  const { data: emailRows } = await supabase
    .from('emails')
    .select('id, received_at, from_address, to_addresses, cc_addresses')
    .in('id', ids)
    .order('received_at', { ascending: true })

  if (!emailRows || emailRows.length === 0) return EMPTY

  // Collect every address across from/to/cc, normalised to bare lowercase email.
  const allAddresses = new Set<string>()
  for (const row of emailRows) {
    allAddresses.add(extractEmail(row.from_address))
    const toArr = Array.isArray(row.to_addresses) ? row.to_addresses : []
    const ccArr = Array.isArray(row.cc_addresses) ? row.cc_addresses : []
    for (const a of toArr) if (typeof a === 'string') allAddresses.add(extractEmail(a))
    for (const a of ccArr) if (typeof a === 'string') allAddresses.add(extractEmail(a))
  }

  // Exclude the workspace's own connected mailbox addresses.
  const connectedAddresses = await getConnectedAddresses(workspaceId)
  const connectedSet = new Set(connectedAddresses.map((a) => a.toLowerCase()))
  const filteredAddresses = [...allAddresses].filter((a) => !connectedSet.has(a))

  if (filteredAddresses.length === 0) return EMPTY

  // Resolve addresses through the identity layer.
  // groupAddressesByPerson collapses multiple addresses into one Person when they share an identity.
  const personMap = await groupAddressesByPerson(workspaceId, filteredAddresses)

  // Build a reverse map: every known address for a person -> the person's map key.
  // This covers all sibling addresses fetched by groupAddressesByPerson, not just the ones
  // present in this room, so we correctly attribute any address in the email headers.
  const addressToPersonKey = new Map<string, string>()
  for (const [personKey, person] of personMap) {
    if (personKey === null) continue
    for (const addr of person.addresses) {
      addressToPersonKey.set(addr.toLowerCase(), personKey)
    }
  }

  // Walk email rows chronologically and record the first email per person.
  const firstEmail = new Map<string, { id: string; date: string }>()
  for (const row of emailRows) {
    const rowAddresses: string[] = [extractEmail(row.from_address)]
    const toArr = Array.isArray(row.to_addresses) ? row.to_addresses : []
    const ccArr = Array.isArray(row.cc_addresses) ? row.cc_addresses : []
    for (const a of toArr) if (typeof a === 'string') rowAddresses.push(extractEmail(a))
    for (const a of ccArr) if (typeof a === 'string') rowAddresses.push(extractEmail(a))

    for (const addr of rowAddresses) {
      const personKey = addressToPersonKey.get(addr)
      if (personKey === undefined) continue
      if (!firstEmail.has(personKey)) {
        firstEmail.set(personKey, { id: row.id, date: row.received_at })
      }
    }
  }

  // Collect all contact IDs from the resolved persons to query pending merges.
  const allContactIds = new Set<string>()
  const contactIdToPersonKey = new Map<string, string>()
  for (const [personKey, person] of personMap) {
    if (personKey === null) continue
    for (const contactId of person.contactIds) {
      allContactIds.add(contactId)
      contactIdToPersonKey.set(contactId, personKey)
    }
  }

  // Find pending merge candidates where both contacts are from this room's cast.
  const pendingMerges: PendingMerge[] = []
  const mergesByPersonKey = new Map<string, { candidateId: string; partnerKey: string }>()

  if (allContactIds.size > 0) {
    const contactIdArray = [...allContactIds]

    const { data: candidates } = await supabase
      .from('contact_merge_candidates')
      .select('id, contact_id_low, contact_id_high, signals')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .in('contact_id_low', contactIdArray)
      .in('contact_id_high', contactIdArray)

    for (const candidate of candidates ?? []) {
      const keyA = contactIdToPersonKey.get(candidate.contact_id_low)
      const keyB = contactIdToPersonKey.get(candidate.contact_id_high)
      if (!keyA || !keyB || keyA === keyB) continue

      const signals = (candidate.signals ?? {}) as Record<string, boolean>

      pendingMerges.push({ candidateId: candidate.id, personKeyA: keyA, personKeyB: keyB, signals })

      // Attach to each person so the tab can look up their merge state by personKey.
      if (!mergesByPersonKey.has(keyA)) {
        mergesByPersonKey.set(keyA, { candidateId: candidate.id, partnerKey: keyB })
      }
      if (!mergesByPersonKey.has(keyB)) {
        mergesByPersonKey.set(keyB, { candidateId: candidate.id, partnerKey: keyA })
      }
    }
  }

  // Assemble RoomPerson[] ordered by firstEmailDate ascending.
  const persons: RoomPerson[] = []
  for (const [personKey, person] of personMap) {
    if (personKey === null) continue
    const first = firstEmail.get(personKey)
    if (!first) continue

    const merge = mergesByPersonKey.get(personKey) ?? null

    persons.push({
      person,
      firstEmailId: first.id,
      firstEmailDate: first.date,
      pendingMergeWith: merge?.candidateId ?? null,
      mergePartnerPersonKey: merge?.partnerKey ?? null,
    })
  }

  persons.sort((a, b) => a.firstEmailDate.localeCompare(b.firstEmailDate))

  return { persons, pendingMerges }
}
