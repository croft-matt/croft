import { createClient } from '@/lib/supabase/server'

// The person an address resolves to. A contact with no identity_id resolves to
// a singleton person built from that contact, so callers never special-case null.
export interface Person {
  identityId: string | null
  name: string | null
  organisation: string | null
  addresses: string[]
  contactIds: string[]
}

// Canonical name resolution order:
// 1. identity.canonical_name if set
// 2. Most recently seen non-null contact.name among the identity's members (by last_seen_at)
// 3. null
function resolveCanonicalName(
  identity: { canonical_name: string | null } | null,
  contacts: Array<{ name: string | null; last_seen_at: string }>,
): string | null {
  if (identity?.canonical_name) return identity.canonical_name
  const sorted = [...contacts]
    .filter((c) => c.name !== null)
    .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
  return sorted[0]?.name ?? null
}

// Returns the person an address resolves to.
// If the contact has no identity_id, returns a singleton Person (identityId: null).
export async function getPersonForAddress(
  workspaceId: string,
  address: string,
): Promise<Person> {
  const supabase = await createClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email_address, name, organisation, identity_id, last_seen_at')
    .eq('workspace_id', workspaceId)
    .eq('email_address', address.toLowerCase())
    .single()

  if (!contact) {
    // Address has no contact row. Return a minimal singleton.
    return {
      identityId: null,
      name: null,
      organisation: null,
      addresses: [address.toLowerCase()],
      contactIds: [],
    }
  }

  if (!contact.identity_id) {
    return {
      identityId: null,
      name: contact.name,
      organisation: contact.organisation,
      addresses: [contact.email_address.toLowerCase()],
      contactIds: [contact.id],
    }
  }

  // Fetch the identity and all sibling contacts.
  const [{ data: identity }, { data: siblings }] = await Promise.all([
    supabase
      .from('contact_identities')
      .select('id, canonical_name, canonical_organisation')
      .eq('id', contact.identity_id)
      .single(),
    supabase
      .from('contacts')
      .select('id, email_address, name, organisation, last_seen_at')
      .eq('workspace_id', workspaceId)
      .eq('identity_id', contact.identity_id),
  ])

  const members = siblings ?? []
  const name = resolveCanonicalName(identity ?? null, members)

  return {
    identityId: contact.identity_id,
    name,
    organisation: identity?.canonical_organisation ?? members[0]?.organisation ?? null,
    addresses: members.map((c) => c.email_address.toLowerCase()),
    contactIds: members.map((c) => c.id),
  }
}

// Groups a set of owner addresses into people, for awaiting-others and rosters.
// - Null addresses collapse into a single null-key entry.
// - Addresses that share an identity collapse into one Person entry.
// Returns a Map keyed by a stable person key:
//   - identityId (string) for merged contacts
//   - lowercased address for singletons
//   - null for the group of unassigned (owner = null) addresses
export async function groupAddressesByPerson(
  workspaceId: string,
  addresses: (string | null)[],
): Promise<Map<string | null, Person>> {
  const result = new Map<string | null, Person>()

  const nonNull = [...new Set(addresses.filter((a): a is string => a !== null))].map((a) =>
    a.toLowerCase(),
  )

  if (nonNull.length === 0) return result

  const supabase = await createClient()

  // Batch-fetch all contacts for the given addresses.
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email_address, name, organisation, identity_id, last_seen_at')
    .eq('workspace_id', workspaceId)
    .in('email_address', nonNull)

  const contactsByAddress = new Map(
    (contacts ?? []).map((c) => [c.email_address.toLowerCase(), c]),
  )

  // Collect all unique identity IDs so we can batch-fetch them.
  const identityIds = [
    ...new Set(
      (contacts ?? [])
        .map((c) => c.identity_id)
        .filter((id): id is string => id !== null),
    ),
  ]

  const identityMap = new Map<
    string,
    { id: string; canonical_name: string | null; canonical_organisation: string | null }
  >()

  if (identityIds.length > 0) {
    const { data: identities } = await supabase
      .from('contact_identities')
      .select('id, canonical_name, canonical_organisation')
      .in('id', identityIds)

    for (const identity of identities ?? []) {
      identityMap.set(identity.id, identity)
    }

    // For each identity, fetch all its member contacts (not just the ones
    // in the address list) so we can build the full addresses array.
    const { data: allMembers } = await supabase
      .from('contacts')
      .select('id, email_address, name, organisation, identity_id, last_seen_at')
      .eq('workspace_id', workspaceId)
      .in('identity_id', identityIds)

    // Group members by identity_id so we can build Person objects.
    const membersByIdentity = new Map<string, typeof allMembers>()
    for (const member of allMembers ?? []) {
      if (!member.identity_id) continue
      const list = membersByIdentity.get(member.identity_id) ?? []
      list.push(member)
      membersByIdentity.set(member.identity_id, list)
    }

    // Build Person entries for merged contacts.
    // Use the identity_id as the map key so all addresses for one person share one entry.
    const resolvedIdentityIds = new Set<string>()

    for (const addr of nonNull) {
      const contact = contactsByAddress.get(addr)
      if (!contact?.identity_id) continue

      const iid = contact.identity_id
      if (resolvedIdentityIds.has(iid)) continue
      resolvedIdentityIds.add(iid)

      const identity = identityMap.get(iid) ?? null
      const members = membersByIdentity.get(iid) ?? []
      const name = resolveCanonicalName(identity, members)

      result.set(iid, {
        identityId: iid,
        name,
        organisation: identity?.canonical_organisation ?? members[0]?.organisation ?? null,
        addresses: members.map((c) => c.email_address.toLowerCase()),
        contactIds: members.map((c) => c.id),
      })
    }
  }

  // Build singleton Person entries for contacts without an identity.
  for (const addr of nonNull) {
    const contact = contactsByAddress.get(addr)

    if (contact && contact.identity_id) continue

    const personKey = addr
    if (result.has(personKey)) continue

    result.set(personKey, {
      identityId: null,
      name: contact?.name ?? null,
      organisation: contact?.organisation ?? null,
      addresses: [addr],
      contactIds: contact ? [contact.id] : [],
    })
  }

  return result
}
