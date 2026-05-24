import stringSimilarity from 'string-similarity'
import { createAdminClient } from '@/lib/supabase/admin'

// Free-mailbox domains. A shared domain from this list never fires shared_org.
const PUBLIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'aol.com',
  'msn.com',
])

// Minimum Dice coefficient for display_name_fuzzy to fire.
// Start conservative; tune against real workspace data before loosening.
const FUZZY_NAME_THRESHOLD = 0.85

// Minimum weighted score before a candidate is written as pending.
const SUGGEST_THRESHOLD = 0.6

export type Signal =
  | 'display_name_exact'
  | 'display_name_fuzzy'
  | 'shared_org'
  | 'local_part_match'
  | 'co_occurrence'

const SIGNAL_WEIGHTS: Record<Signal, number> = {
  display_name_exact: 0.5,
  display_name_fuzzy: 0.35,
  shared_org: 0.25,
  local_part_match: 0.25,
  co_occurrence: 0.2,
}

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normaliseLocalPart(email: string): string {
  const local = email.split('@')[0] ?? ''
  // Strip plus-tags (e.g. user+tag -> user) then strip dots.
  return local.split('+')[0].replace(/\./g, '').toLowerCase()
}

function domainOf(email: string): string {
  return (email.split('@')[1] ?? '').toLowerCase()
}

function isPublicDomain(domain: string): boolean {
  return PUBLIC_DOMAINS.has(domain)
}

export function scoreSignals(signals: Signal[]): number {
  return signals.reduce((sum, s) => sum + SIGNAL_WEIGHTS[s], 0)
}

// The common-name guard. A name signal alone never produces a suggestion:
// it must be corroborated by at least one non-name signal to prevent merging
// two different people who share a common name.
export function commonNameGuard(signals: Signal[]): boolean {
  const hasName = signals.includes('display_name_exact') || signals.includes('display_name_fuzzy')
  if (!hasName) return true
  return (
    signals.includes('shared_org') ||
    signals.includes('local_part_match') ||
    signals.includes('co_occurrence')
  )
}

interface ContactRow {
  id: string
  email_address: string
  name: string | null
  organisation: string | null
  identity_id: string | null
}

function computeSignals(
  a: ContactRow,
  b: ContactRow,
  coOccurs: boolean,
): Signal[] {
  const signals: Signal[] = []

  // Name signals
  if (a.name && b.name) {
    const na = normaliseName(a.name)
    const nb = normaliseName(b.name)
    if (na && nb) {
      if (na === nb) {
        signals.push('display_name_exact')
      } else {
        const sim = stringSimilarity.compareTwoStrings(na, nb)
        if (sim >= FUZZY_NAME_THRESHOLD) {
          signals.push('display_name_fuzzy')
        }
      }
    }
  }

  // Shared org / shared domain (non-public)
  const domainA = domainOf(a.email_address)
  const domainB = domainOf(b.email_address)
  if (a.organisation && b.organisation) {
    const orgA = normaliseName(a.organisation)
    const orgB = normaliseName(b.organisation)
    if (orgA && orgB && orgA === orgB) {
      signals.push('shared_org')
    }
  } else if (
    domainA === domainB &&
    domainA !== '' &&
    !isPublicDomain(domainA)
  ) {
    signals.push('shared_org')
  }

  // Local part match
  const lpA = normaliseLocalPart(a.email_address)
  const lpB = normaliseLocalPart(b.email_address)
  if (lpA && lpB && lpA === lpB) {
    signals.push('local_part_match')
  }

  // Co-occurrence (thread or INTRODUCE job)
  if (coOccurs) {
    signals.push('co_occurrence')
  }

  return signals
}

// Returns true if the two addresses co-occurred in any email thread in the workspace.
// A co-occurrence is defined as: one address is the sender and the other appears in
// to_addresses or cc_addresses of the same email.
async function checkCoOccurrence(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  addrA: string,
  addrB: string,
): Promise<boolean> {
  // Check A->B direction: A sent, B was a recipient
  const { count: countAB } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('from_address', addrA)
    .contains('to_addresses', [addrB])

  if (countAB && countAB > 0) return true

  const { count: countABcc } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('from_address', addrA)
    .contains('cc_addresses', [addrB])

  if (countABcc && countABcc > 0) return true

  // Check B->A direction
  const { count: countBA } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('from_address', addrB)
    .contains('to_addresses', [addrA])

  if (countBA && countBA > 0) return true

  const { count: countBAcc } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('from_address', addrB)
    .contains('cc_addresses', [addrA])

  if (countBAcc && countBAcc > 0) return true

  return false
}

// Orders two contact IDs so contact_id_low < contact_id_high (UUID string compare).
// This matches the unique constraint on contact_merge_candidates.
function orderedPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA]
}

// Runs the matcher for a single contact against all other workspace contacts.
// Writes pending candidates for pairs that pass the score threshold and the
// common-name guard. Never sets status to accepted. Never merges automatically.
export async function runMatcherForContact(
  contactId: string,
  workspaceId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // Fetch the contact being evaluated.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, email_address, name, organisation, identity_id')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!contact) return

  // Fetch all other workspace contacts to compare against.
  const { data: others } = await supabase
    .from('contacts')
    .select('id, email_address, name, organisation, identity_id')
    .eq('workspace_id', workspaceId)
    .neq('id', contactId)

  if (!others || others.length === 0) return

  // Fetch connected addresses (workspace mailboxes) to exclude from matching.
  // These are the user's own addresses; they must not be merged with external contacts.
  const { data: accountRows } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const connectedAddresses = new Set(
    (accountRows ?? []).map((r) => r.email_address.toLowerCase()),
  )

  // Skip if the contact itself is a connected address.
  if (connectedAddresses.has(contact.email_address.toLowerCase())) return

  // Load all existing decisions for this contact (accepted or dismissed).
  // A dismissed pair is a durable do-not-merge and must never be re-suggested.
  const { data: existingRows } = await supabase
    .from('contact_merge_candidates')
    .select('contact_id_low, contact_id_high, status')
    .eq('workspace_id', workspaceId)
    .or(`contact_id_low.eq.${contactId},contact_id_high.eq.${contactId}`)
    .in('status', ['accepted', 'dismissed'])

  const decidedPairs = new Set(
    (existingRows ?? []).map((r) => `${r.contact_id_low}:${r.contact_id_high}`),
  )

  for (const other of others) {
    // Skip other connected addresses.
    if (connectedAddresses.has(other.email_address.toLowerCase())) continue

    const [idLow, idHigh] = orderedPair(contactId, other.id)
    const pairKey = `${idLow}:${idHigh}`

    // Skip pairs with an existing decision (accepted or dismissed).
    if (decidedPairs.has(pairKey)) continue

    // Skip pairs in the same identity — already merged.
    if (contact.identity_id && contact.identity_id === other.identity_id) continue

    const coOccurs = await checkCoOccurrence(
      supabase,
      workspaceId,
      contact.email_address,
      other.email_address,
    )

    const signals = computeSignals(contact, other, coOccurs)
    const score = scoreSignals(signals)

    if (score < SUGGEST_THRESHOLD) continue
    if (!commonNameGuard(signals)) continue

    // Write the candidate as pending. The unique constraint on
    // (workspace_id, contact_id_low, contact_id_high) prevents duplicates.
    // On conflict do nothing: a pending row already exists, no action needed.
    await supabase
      .from('contact_merge_candidates')
      .upsert(
        {
          workspace_id: workspaceId,
          contact_id_low: idLow,
          contact_id_high: idHigh,
          score,
          signals: signals.reduce<Record<string, boolean>>((acc, s) => {
            acc[s] = true
            return acc
          }, {}),
          status: 'pending',
        },
        {
          onConflict: 'workspace_id,contact_id_low,contact_id_high',
          ignoreDuplicates: true,
        },
      )
  }
}
