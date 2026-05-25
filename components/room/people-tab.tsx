'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { RoomPeople, RoomPerson, PendingMerge } from '@/lib/rooms/people'
import { EmailCitation } from '@/components/room/email-citation'
import { MergeSuggestion } from '@/components/room/merge-suggestion'

interface PeopleTabProps {
  people: RoomPeople
}

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string | null, fallback: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return fallback.slice(0, 2).toUpperCase()
}

function PersonRow({ roomPerson }: { roomPerson: RoomPerson }) {
  const { person, firstEmailId } = roomPerson
  const displayName = person.name ?? person.addresses[0] ?? ''
  const avatarSeed = person.addresses[0] ?? displayName
  const initials = getInitials(person.name, avatarSeed)

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
          hashNeutral(avatarSeed),
        )}
      >
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
        {(person.organisation || person.addresses.length > 1) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {[
              person.organisation,
              person.addresses.length > 1 ? person.addresses.join(', ') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {person.addresses.length === 1 && (
          <span className="text-xs text-muted-foreground hidden sm:block">
            {person.addresses[0]}
          </span>
        )}
        <EmailCitation emailId={firstEmailId} label="first email" />
      </div>
    </div>
  )
}

export function PeopleTab({ people }: PeopleTabProps) {
  const [persons, setPersons] = useState<RoomPerson[]>(people.persons)
  const [pendingMerges, setPendingMerges] = useState<PendingMerge[]>(people.pendingMerges)

  // Build a quick lookup: personKey -> RoomPerson.
  // PersonKey is either an identityId or a lowercased address (singleton).
  function personKeyFor(rp: RoomPerson): string {
    return rp.person.identityId ?? rp.person.addresses[0] ?? ''
  }

  function handleDismiss(candidateId: string) {
    setPendingMerges((prev) => prev.filter((m) => m.candidateId !== candidateId))
    setPersons((prev) =>
      prev.map((p) =>
        p.pendingMergeWith === candidateId
          ? { ...p, pendingMergeWith: null, mergePartnerPersonKey: null }
          : p,
      ),
    )
  }

  function handleAccept(merge: PendingMerge) {
    const { candidateId, personKeyA, personKeyB } = merge

    setPersons((prev) => {
      const a = prev.find((p) => personKeyFor(p) === personKeyA)
      const b = prev.find((p) => personKeyFor(p) === personKeyB)
      if (!a || !b) return prev

      // The surviving row keeps the earlier first-email date.
      const earlier =
        a.firstEmailDate <= b.firstEmailDate ? a : b
      const later = earlier === a ? b : a

      const mergedPerson: RoomPerson = {
        ...earlier,
        person: {
          ...earlier.person,
          name: earlier.person.name ?? later.person.name,
          organisation: earlier.person.organisation ?? later.person.organisation,
          addresses: [
            ...new Set([...earlier.person.addresses, ...later.person.addresses]),
          ],
          contactIds: [...new Set([...earlier.person.contactIds, ...later.person.contactIds])],
        },
        pendingMergeWith: null,
        mergePartnerPersonKey: null,
      }

      return prev
        .filter((p) => personKeyFor(p) !== personKeyA && personKeyFor(p) !== personKeyB)
        .concat(mergedPerson)
        .sort((x, y) => x.firstEmailDate.localeCompare(y.firstEmailDate))
    })

    setPendingMerges((prev) => prev.filter((m) => m.candidateId !== candidateId))
  }

  if (persons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No contacts have appeared in this room's emails.
      </p>
    )
  }

  // Build a set of candidateIds that have already been rendered to avoid duplicates
  // when both persons in a pair are iterated.
  const renderedMerges = new Set<string>()

  return (
    <div className="space-y-2">
      {persons.map((roomPerson) => {
        const personKey = personKeyFor(roomPerson)
        const merge = roomPerson.pendingMergeWith
          ? pendingMerges.find((m) => m.candidateId === roomPerson.pendingMergeWith)
          : null

        // Determine whether to render the suggestion after this row.
        let suggestion: React.ReactNode = null
        if (merge && !renderedMerges.has(merge.candidateId)) {
          const partnerKey = roomPerson.mergePartnerPersonKey
          const partner = partnerKey
            ? persons.find((p) => personKeyFor(p) === partnerKey)
            : null

          if (partner) {
            renderedMerges.add(merge.candidateId)

            const isA = merge.personKeyA === personKey
            const personA = isA ? roomPerson : partner
            const personB = isA ? partner : roomPerson

            suggestion = (
              <MergeSuggestion
                key={merge.candidateId}
                merge={merge}
                personA={personA}
                personB={personB}
                onAccept={() => handleAccept(merge)}
                onDismiss={() => handleDismiss(merge.candidateId)}
              />
            )
          }
        }

        return (
          <div key={personKey}>
            <PersonRow roomPerson={roomPerson} />
            {suggestion}
          </div>
        )
      })}
    </div>
  )
}
