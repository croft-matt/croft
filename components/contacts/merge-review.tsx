'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { acceptMerge, dismissMerge, splitContact } from '@/lib/contacts/identity-actions'

const SIGNAL_LABELS: Record<string, string> = {
  display_name_exact: 'Same name',
  display_name_fuzzy: 'Similar name',
  shared_org: 'Shared organisation',
  local_part_match: 'Related addresses',
  co_occurrence: 'Appeared in the same email thread',
}

function signalsToText(signals: Record<string, boolean>): string {
  const parts = Object.entries(signals)
    .filter(([, v]) => v)
    .map(([k]) => SIGNAL_LABELS[k] ?? k)
  return parts.length > 0 ? parts.join(', ') : 'No signals recorded'
}

function canonicalNamePreview(
  nameA: string | null,
  nameB: string | null,
  emailA: string,
): string {
  return nameA ?? nameB ?? emailA
}

export interface MergeCandidate {
  id: string
  score: number
  signals: Record<string, boolean>
  contactLow: {
    id: string
    email_address: string
    name: string | null
    organisation: string | null
  }
  contactHigh: {
    id: string
    email_address: string
    name: string | null
    organisation: string | null
  }
}

export interface MergedIdentity {
  id: string
  canonical_name: string | null
  name_locked: boolean
  members: Array<{
    id: string
    email_address: string
    name: string | null
  }>
}

interface MergeReviewProps {
  candidates: MergeCandidate[]
  identities: MergedIdentity[]
}

function ContactCard({
  name,
  email,
  organisation,
}: {
  name: string | null
  email: string
  organisation: string | null
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 min-w-0">
      <p className="text-sm font-medium text-neutral-100 truncate">{name ?? email}</p>
      {name && <p className="text-xs text-neutral-500 truncate">{email}</p>}
      {organisation && <p className="text-xs text-neutral-600 truncate">{organisation}</p>}
    </div>
  )
}

function ActionButton({
  onClick,
  pending,
  variant,
  children,
}: {
  onClick: () => void
  pending: boolean
  variant: 'primary' | 'ghost' | 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center rounded px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40',
        variant === 'primary' && 'bg-neutral-100 text-neutral-900 hover:bg-white',
        variant === 'ghost' && 'border border-neutral-700 text-neutral-400 hover:text-neutral-200',
        variant === 'danger' && 'border border-neutral-700 text-neutral-500 hover:text-red-400 hover:border-red-800',
      )}
    >
      {children}
    </button>
  )
}

function CandidateRow({ candidate }: { candidate: MergeCandidate }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { contactLow: low, contactHigh: high } = candidate

  function handleAccept() {
    startTransition(async () => {
      await acceptMerge(candidate.id)
      router.refresh()
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissMerge(candidate.id)
      router.refresh()
    })
  }

  const preview = canonicalNamePreview(low.name, high.name, low.email_address)
  const reason = signalsToText(candidate.signals)

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <ContactCard
              name={low.name}
              email={low.email_address}
              organisation={low.organisation}
            />
          </div>
          <div className="hidden sm:flex items-center text-neutral-600 text-xs px-1">+</div>
          <div className="flex-1 min-w-0">
            <ContactCard
              name={high.name}
              email={high.email_address}
              organisation={high.organisation}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <p className="text-xs text-neutral-500">{reason}</p>
        <p className="text-xs text-neutral-700">
          Merged as: <span className="text-neutral-400">{preview}</span>
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <ActionButton onClick={handleAccept} pending={pending} variant="primary">
          Merge
        </ActionButton>
        <ActionButton onClick={handleDismiss} pending={pending} variant="ghost">
          Keep separate
        </ActionButton>
      </div>
    </div>
  )
}

function IdentityRow({ identity }: { identity: MergedIdentity }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleSplit(contactId: string) {
    startTransition(async () => {
      await splitContact(contactId)
      router.refresh()
    })
  }

  const heading = identity.canonical_name ?? identity.members[0]?.name ?? identity.members[0]?.email_address ?? 'Unknown'

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-medium text-neutral-100">{heading}</p>
        {identity.name_locked && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 border border-neutral-700 rounded px-1.5 py-0.5">
            Locked
          </span>
        )}
      </div>
      <div className="space-y-2">
        {identity.members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-neutral-300 truncate">{member.name ?? member.email_address}</p>
              {member.name && (
                <p className="text-xs text-neutral-600 truncate">{member.email_address}</p>
              )}
            </div>
            <ActionButton
              onClick={() => handleSplit(member.id)}
              pending={pending}
              variant="danger"
            >
              Split
            </ActionButton>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MergeReview({ candidates, identities }: MergeReviewProps) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">
            Possible duplicates
          </p>
          <p className="text-xs text-neutral-600">
            {candidates.length === 0
              ? 'No suggestions. Croft will surface new ones as email arrives.'
              : `${candidates.length} suggestion${candidates.length === 1 ? '' : 's'}, ordered by confidence.`}
          </p>
        </div>
        {candidates.length > 0 && (
          <div className="space-y-3">
            {candidates.map((c) => (
              <CandidateRow key={c.id} candidate={c} />
            ))}
          </div>
        )}
      </section>

      {identities.length > 0 && (
        <section>
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">
              Merged people
            </p>
            <p className="text-xs text-neutral-600">
              Split removes a contact from a person. If only one contact remains, the person is dissolved.
            </p>
          </div>
          <div className="space-y-3">
            {identities.map((identity) => (
              <IdentityRow key={identity.id} identity={identity} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
