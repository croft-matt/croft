'use client'

import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { acceptMerge, dismissMerge } from '@/lib/contacts/identity-actions'
import type { PendingMerge, RoomPerson } from '@/lib/rooms/people'

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
  return parts.length > 0 ? parts.join(', ') : 'Similar contact details'
}

interface MergeSuggestionProps {
  merge: PendingMerge
  personA: RoomPerson
  personB: RoomPerson
  onAccept: () => void
  onDismiss: () => void
}

export function MergeSuggestion({ merge, personA, personB, onAccept, onDismiss }: MergeSuggestionProps) {
  const [pending, startTransition] = useTransition()

  const nameA = personA.person.name ?? personA.person.addresses[0] ?? ''
  const nameB = personB.person.name ?? personB.person.addresses[0] ?? ''
  const reason = signalsToText(merge.signals)

  function handleAccept() {
    startTransition(async () => {
      await acceptMerge(merge.candidateId)
      onAccept()
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissMerge(merge.candidateId)
      onDismiss()
    })
  }

  return (
    <div className="mx-1 mb-2 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">{nameA}</span>
          {' and '}
          <span className="text-foreground font-medium">{nameB}</span>
          {' may be the same person. '}
          <span className="text-muted-foreground/70">{reason}.</span>
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={handleAccept}
          disabled={pending}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-40',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          Same person
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className={cn(
            'rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors disabled:opacity-40',
            'hover:text-foreground',
          )}
        >
          Different people
        </button>
      </div>
    </div>
  )
}
