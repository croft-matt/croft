import { createClient } from '@/lib/supabase/server'

export interface ContactPerson {
  // If merged, this is the identity id; otherwise the single contact id
  key: string
  identityId: string | null
  name: string | null
  addresses: string[]
  organisation: string | null
  role: string | null
  lastSeenAt: string
  firstSeenAt: string
  emailCount: number
  rooms: Array<{ id: string; name: string }>
}

export async function getWorkspaceContactsWithMeta(workspaceId: string): Promise<ContactPerson[]> {
  const supabase = await createClient()

  // 1. Fetch all contacts for the workspace
  const { data: rawContacts } = await supabase
    .from('contacts')
    .select('id, name, email_address, organisation, role, identity_id, last_seen_at, first_seen_at')
    .eq('workspace_id', workspaceId)
    .order('last_seen_at', { ascending: false })

  if (!rawContacts || rawContacts.length === 0) return []

  // 2. Fetch canonical names for merged identities
  const identityIds = [...new Set(rawContacts.filter((c) => c.identity_id).map((c) => c.identity_id!))]
  const identityNameMap = new Map<string, string | null>()
  if (identityIds.length > 0) {
    const { data: identities } = await supabase
      .from('contact_identities')
      .select('id, canonical_name')
      .in('id', identityIds)
    for (const i of identities ?? []) {
      identityNameMap.set(i.id, i.canonical_name)
    }
  }

  // 3. Group contacts by identity (deduplicate)
  //    Key: identity_id if present, else the contact's own id
  const groups = new Map<
    string,
    {
      key: string
      identityId: string | null
      contacts: typeof rawContacts
    }
  >()

  for (const c of rawContacts) {
    const groupKey = c.identity_id ?? c.id
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { key: groupKey, identityId: c.identity_id, contacts: [] })
    }
    groups.get(groupKey)!.contacts.push(c)
  }

  // 4. Collect all unique email addresses
  const allAddresses = [...new Set(rawContacts.map((c) => c.email_address))]

  // 5. One query: fetch emails (from this workspace, sent from any of these contacts)
  //    with their room associations. We limit fields to avoid pulling body etc.
  const { data: emailRows } = await supabase
    .from('emails')
    .select('from_address, room_emails(rooms(id, name))')
    .eq('workspace_id', workspaceId)
    .in('from_address', allAddresses)

  // 6. Build per-address maps: emailCount and rooms
  const emailCountByAddress = new Map<string, number>()
  const roomsByAddress = new Map<string, Map<string, { id: string; name: string }>>()

  for (const email of emailRows ?? []) {
    const addr = email.from_address
    emailCountByAddress.set(addr, (emailCountByAddress.get(addr) ?? 0) + 1)

    if (!roomsByAddress.has(addr)) roomsByAddress.set(addr, new Map())
    const roomMap = roomsByAddress.get(addr)!

    const roomEmailsArr = Array.isArray(email.room_emails) ? email.room_emails : []
    for (const re of roomEmailsArr) {
      const room = re.rooms as { id: string; name: string } | null
      if (room?.id && !roomMap.has(room.id)) {
        roomMap.set(room.id, { id: room.id, name: room.name })
      }
    }
  }

  // 7. Assemble the final ContactPerson list
  const persons: ContactPerson[] = []

  for (const [, group] of groups) {
    const { identityId, contacts } = group

    // Pick the best name: canonical identity name > first non-null contact name
    const canonicalName = identityId ? (identityNameMap.get(identityId) ?? null) : null
    const name = canonicalName ?? contacts.find((c) => c.name)?.name ?? null

    // Best org/role: first non-null among grouped contacts
    const organisation = contacts.find((c) => c.organisation)?.organisation ?? null
    const role = contacts.find((c) => c.role)?.role ?? null

    // Dates: latest last_seen, earliest first_seen across all addresses in group
    const lastSeenAt = contacts.reduce((best, c) =>
      c.last_seen_at > best ? c.last_seen_at : best,
      contacts[0].last_seen_at
    )
    const firstSeenAt = contacts.reduce((best, c) =>
      c.first_seen_at < best ? c.first_seen_at : best,
      contacts[0].first_seen_at
    )

    const addresses = contacts.map((c) => c.email_address)

    // Aggregate email count + rooms across all addresses in group
    let emailCount = 0
    const mergedRooms = new Map<string, { id: string; name: string }>()
    for (const addr of addresses) {
      emailCount += emailCountByAddress.get(addr) ?? 0
      const roomMap = roomsByAddress.get(addr)
      if (roomMap) {
        for (const [roomId, room] of roomMap) {
          if (!mergedRooms.has(roomId)) mergedRooms.set(roomId, room)
        }
      }
    }

    persons.push({
      key: group.key,
      identityId,
      name,
      addresses,
      organisation,
      role,
      lastSeenAt,
      firstSeenAt,
      emailCount,
      rooms: [...mergedRooms.values()],
    })
  }

  // Sort by lastSeenAt desc
  persons.sort((a, b) => (a.lastSeenAt > b.lastSeenAt ? -1 : 1))

  return persons
}
