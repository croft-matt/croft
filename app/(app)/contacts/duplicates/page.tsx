import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { backfillContactMatchingTask } from '@/trigger/jobs/backfill-contact-matching'
import { MergeReview, type MergeCandidate, type MergedIdentity } from '@/components/contacts/merge-review'
import { BackfillButton } from '@/components/contacts/backfill-button'

async function triggerBackfill(workspaceId: string): Promise<void> {
  'use server'
  await requireUser()
  await tasks.trigger<typeof backfillContactMatchingTask>('backfill-contact-matching', {
    workspaceId,
  })
}

export default async function DuplicatesPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()

  if (!workspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">No workspace found.</p>
      </div>
    )
  }

  const supabase = await createClient()

  // Fetch pending candidates ordered by score descending.
  const { data: rawCandidates } = await supabase
    .from('contact_merge_candidates')
    .select('id, score, signals, contact_id_low, contact_id_high')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('score', { ascending: false })

  // Collect all contact IDs from the candidates, batch-fetch them.
  const candidateContactIds = new Set<string>()
  for (const c of rawCandidates ?? []) {
    candidateContactIds.add(c.contact_id_low)
    candidateContactIds.add(c.contact_id_high)
  }

  const { data: candidateContacts } = candidateContactIds.size > 0
    ? await supabase
        .from('contacts')
        .select('id, email_address, name, organisation')
        .in('id', [...candidateContactIds])
    : { data: [] }

  const contactById = new Map(
    (candidateContacts ?? []).map((c) => [c.id, c]),
  )

  const candidates: MergeCandidate[] = (rawCandidates ?? [])
    .map((c) => {
      const low = contactById.get(c.contact_id_low)
      const high = contactById.get(c.contact_id_high)
      if (!low || !high) return null
      return {
        id: c.id,
        score: c.score,
        signals: (c.signals ?? {}) as Record<string, boolean>,
        contactLow: low,
        contactHigh: high,
      }
    })
    .filter((c): c is MergeCandidate => c !== null)

  // Fetch merged contacts (those with an identity_id) for the Split section.
  const { data: mergedContacts } = await supabase
    .from('contacts')
    .select('id, email_address, name, identity_id')
    .eq('workspace_id', workspaceId)
    .not('identity_id', 'is', null)

  // Group members by identity_id.
  const membersByIdentity = new Map<string, typeof mergedContacts>()
  for (const c of mergedContacts ?? []) {
    if (!c.identity_id) continue
    const list = membersByIdentity.get(c.identity_id) ?? []
    list.push(c)
    membersByIdentity.set(c.identity_id, list)
  }

  // Only show identities with two or more members (single-member identities
  // should not exist after splitContact, but guard just in case).
  const identityIds = [...membersByIdentity.entries()]
    .filter(([, members]) => members && members.length >= 2)
    .map(([id]) => id)

  const { data: rawIdentities } = identityIds.length > 0
    ? await supabase
        .from('contact_identities')
        .select('id, canonical_name, name_locked')
        .in('id', identityIds)
    : { data: [] }

  const identities: MergedIdentity[] = (rawIdentities ?? []).map((identity) => ({
    id: identity.id,
    canonical_name: identity.canonical_name,
    name_locked: identity.name_locked,
    members: (membersByIdentity.get(identity.id) ?? []).map((m) => ({
      id: m.id,
      email_address: m.email_address,
      name: m.name,
    })),
  }))

  const backfillAction = triggerBackfill.bind(null, workspaceId)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Duplicate contacts</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Review contacts that look like the same person. Every merge requires your approval.
          </p>
        </div>
        <BackfillButton action={backfillAction} />
      </div>
      <MergeReview candidates={candidates} identities={identities} />
    </div>
  )
}
