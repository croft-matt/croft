'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface ActionResult {
  success: boolean
  error?: string
}

// Accept a suggested merge. If neither contact has an identity, create one and
// attach both. If one has an identity, attach the other to it. If both have
// different identities, merge the smaller into the larger. Sets the candidate
// to accepted. Never deletes a contact. Never touches jobs.owner.
export async function acceptMerge(candidateId: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: candidate } = await supabase
    .from('contact_merge_candidates')
    .select('id, workspace_id, contact_id_low, contact_id_high, status')
    .eq('id', candidateId)
    .single()

  if (!candidate) return { success: false, error: 'Candidate not found' }
  if (candidate.status !== 'pending') {
    return { success: false, error: 'Candidate is not pending' }
  }

  const workspaceId = candidate.workspace_id

  const [{ data: contactA }, { data: contactB }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, identity_id')
      .eq('id', candidate.contact_id_low)
      .eq('workspace_id', workspaceId)
      .single(),
    supabase
      .from('contacts')
      .select('id, identity_id')
      .eq('id', candidate.contact_id_high)
      .eq('workspace_id', workspaceId)
      .single(),
  ])

  if (!contactA || !contactB) return { success: false, error: 'Contact not found' }

  const idA = contactA.identity_id
  const idB = contactB.identity_id

  if (!idA && !idB) {
    // Neither has an identity. Create one and attach both.
    const { data: newIdentity, error: createError } = await supabase
      .from('contact_identities')
      .insert({ workspace_id: workspaceId })
      .select('id')
      .single()

    if (createError || !newIdentity) {
      return { success: false, error: 'Failed to create identity' }
    }

    const { error: attachError } = await supabase
      .from('contacts')
      .update({ identity_id: newIdentity.id, updated_at: now })
      .in('id', [contactA.id, contactB.id])

    if (attachError) return { success: false, error: 'Failed to attach contacts' }
  } else if (idA && !idB) {
    // A has identity, attach B to it.
    const { error } = await supabase
      .from('contacts')
      .update({ identity_id: idA, updated_at: now })
      .eq('id', contactB.id)

    if (error) return { success: false, error: 'Failed to attach contact' }
  } else if (!idA && idB) {
    // B has identity, attach A to it.
    const { error } = await supabase
      .from('contacts')
      .update({ identity_id: idB, updated_at: now })
      .eq('id', contactA.id)

    if (error) return { success: false, error: 'Failed to attach contact' }
  } else if (idA && idB && idA !== idB) {
    // Both have different identities. Merge the smaller into the larger.
    const [{ count: countA }, { count: countB }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('identity_id', idA),
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('identity_id', idB),
    ])

    // Surviving identity is the larger one; smaller is dissolved into it.
    const survivingId = (countA ?? 0) >= (countB ?? 0) ? idA : idB
    const dissolvedId = survivingId === idA ? idB : idA

    // Fetch both identities to check name_locked and carry it forward.
    const [{ data: surviving }, { data: dissolved }] = await Promise.all([
      supabase
        .from('contact_identities')
        .select('id, canonical_name, canonical_organisation, name_locked')
        .eq('id', survivingId)
        .single(),
      supabase
        .from('contact_identities')
        .select('id, canonical_name, canonical_organisation, name_locked')
        .eq('id', dissolvedId)
        .single(),
    ])

    // If the dissolved identity had a locked name and the surviving one does not,
    // carry the locked name forward onto the surviving identity.
    if (dissolved?.name_locked && !surviving?.name_locked) {
      await supabase
        .from('contact_identities')
        .update({
          canonical_name: dissolved.canonical_name,
          canonical_organisation: dissolved.canonical_organisation,
          name_locked: true,
          updated_at: now,
        })
        .eq('id', survivingId)
    }

    // Move all members of the dissolved identity to the surviving one.
    const { error: moveError } = await supabase
      .from('contacts')
      .update({ identity_id: survivingId, updated_at: now })
      .eq('identity_id', dissolvedId)
      .eq('workspace_id', workspaceId)

    if (moveError) return { success: false, error: 'Failed to merge identities' }

    // Delete the now-empty dissolved identity.
    await supabase.from('contact_identities').delete().eq('id', dissolvedId)
  }
  // If idA === idB, both are already in the same identity. Nothing to do.

  // Mark the candidate as accepted.
  const { error: decideError } = await supabase
    .from('contact_merge_candidates')
    .update({ status: 'accepted', decided_at: now })
    .eq('id', candidateId)

  if (decideError) return { success: false, error: 'Failed to record decision' }

  return { success: true }
}

// Reject a suggested merge. Sets the candidate to dismissed.
// The unique constraint on (workspace_id, contact_id_low, contact_id_high) means
// this pair can never be re-inserted as pending — the decision is durable.
export async function dismissMerge(candidateId: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { data: candidate } = await supabase
    .from('contact_merge_candidates')
    .select('id, status')
    .eq('id', candidateId)
    .single()

  if (!candidate) return { success: false, error: 'Candidate not found' }
  if (candidate.status !== 'pending') {
    return { success: false, error: 'Candidate is not pending' }
  }

  const { error } = await supabase
    .from('contact_merge_candidates')
    .update({ status: 'dismissed', decided_at: new Date().toISOString() })
    .eq('id', candidateId)

  if (error) return { success: false, error: 'Failed to dismiss' }

  return { success: true }
}

// Split a contact out of its identity. Clears the contact's identity_id.
// If the identity is left with one or zero members, dissolves it entirely.
// This is the undo path for a wrong merge and must always be available.
export async function splitContact(contactId: string): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, identity_id, workspace_id')
    .eq('id', contactId)
    .single()

  if (!contact) return { success: false, error: 'Contact not found' }
  if (!contact.identity_id) return { success: true }

  const identityId = contact.identity_id

  // Clear this contact's identity.
  const { error: clearError } = await supabase
    .from('contacts')
    .update({ identity_id: null, updated_at: now })
    .eq('id', contactId)

  if (clearError) return { success: false, error: 'Failed to split contact' }

  // Count remaining members.
  const { count: remaining } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('identity_id', identityId)

  if ((remaining ?? 0) <= 1) {
    // Dissolve: clear the remaining member's identity_id (if any) then delete the identity.
    await supabase
      .from('contacts')
      .update({ identity_id: null, updated_at: now })
      .eq('identity_id', identityId)

    await supabase.from('contact_identities').delete().eq('id', identityId)
  }

  return { success: true }
}

// Set and lock the canonical name (and optionally organisation) for an identity.
// A locked name is never auto-changed by the matcher, by future merges, or by
// the contact upsert in Tier 3. This resolves the Brief 03 open question on
// canonical name stability.
export async function setCanonicalName(
  identityId: string,
  name: string,
  organisation?: string,
): Promise<ActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('contact_identities')
    .update({
      canonical_name: name,
      name_locked: true,
      updated_at: new Date().toISOString(),
      ...(organisation !== undefined ? { canonical_organisation: organisation } : {}),
    })
    .eq('id', identityId)

  if (error) return { success: false, error: 'Failed to set canonical name' }

  return { success: true }
}
