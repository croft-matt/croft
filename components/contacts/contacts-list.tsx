import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ContactPerson } from '@/lib/queries/contacts'

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

interface ContactsListProps {
  contacts: ContactPerson[]
}

export function ContactsList({ contacts }: ContactsListProps) {
  if (contacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No contacts yet — they appear once emails start flowing in.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {contacts.map((person) => {
        const displayName = person.name ?? person.addresses[0] ?? ''
        const avatarSeed = person.addresses[0] ?? displayName
        const initials = getInitials(person.name, avatarSeed)
        const primaryAddress = person.addresses[0] ?? ''

        return (
          <div
            key={person.key}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 hover:bg-muted/40 transition-colors"
          >
            {/* Top row: avatar + name */}
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                  hashNeutral(avatarSeed)
                )}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold text-foreground truncate leading-tight">
                  {displayName}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {primaryAddress}
                </p>
              </div>
            </div>

            {/* Organisation / role */}
            {(person.organisation || person.role) && (
              <p className="text-xs text-muted-foreground truncate -mt-1">
                {[person.role, person.organisation].filter(Boolean).join(' · ')}
              </p>
            )}

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Bottom: rooms + email count */}
            <div className="flex items-end justify-between gap-2 min-h-[28px]">
              {/* Room chips */}
              <div className="flex flex-wrap gap-1 min-w-0">
                {person.rooms.slice(0, 3).map((room) => (
                  <Link
                    key={room.id}
                    href={`/rooms/${room.id}`}
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors whitespace-nowrap"
                  >
                    {room.name}
                  </Link>
                ))}
                {person.rooms.length > 3 && (
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap">
                    +{person.rooms.length - 3}
                  </span>
                )}
              </div>

              {/* Email count */}
              {person.emailCount > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {person.emailCount} {person.emailCount === 1 ? 'email' : 'emails'}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
