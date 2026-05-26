'use client'

import Link from 'next/link'
import type { WaitingOnOthersPerson } from '@/lib/queries/home'

function formatAge(receivedAt: string): string {
  const ms = Date.now() - new Date(receivedAt).getTime()
  const hours = ms / 3600000
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.floor(hours)}h ago`
  return `${Math.ceil(hours / 24)}d ago`
}

function displayName(person: WaitingOnOthersPerson): string {
  if (person.ownerName) return person.ownerName
  return person.ownerAddress.split('@')[0]
}

function metaLine(person: WaitingOnOthersPerson): string {
  const parts: string[] = []
  if (person.ownerOrg) parts.push(person.ownerOrg)
  if (person.roomNames.length > 0) parts.push(person.roomNames.join(', '))
  if (parts.length === 0) {
    const domain = person.ownerAddress.split('@')[1]
    if (domain) parts.push(domain)
  }
  return parts.join(' · ')
}

interface WaitingOnOthersProps {
  persons: WaitingOnOthersPerson[]
}

export function WaitingOnOthers({ persons }: WaitingOnOthersProps) {
  if (persons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-1">Nothing waiting on others.</p>
    )
  }

  const visible = persons.slice(0, 4)
  const overflow = persons.length - 4

  return (
    <div className="space-y-2">
      {visible.map((person) => {
        const name = displayName(person)
        const meta = metaLine(person)
        const visibleItems = person.items.slice(0, 4)

        return (
          <div
            key={person.ownerAddress}
            className="rounded-xl border border-border bg-muted/40 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground">{name}</p>
              {meta && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">{meta}</p>
              )}
            </div>

            <div className="px-4 py-2.5 space-y-2">
              {visibleItems.map((item) => (
                <Link
                  key={item.jobId}
                  href={`/emails/${item.emailId}?from=/`}
                  className="flex items-start justify-between gap-3 hover:opacity-70 transition-opacity"
                >
                  <p className="text-sm text-foreground leading-relaxed line-clamp-2 flex-1">
                    {item.description}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap pt-0.5">
                    {formatAge(item.receivedAt)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}

      {overflow > 0 && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">+ {overflow} more {overflow === 1 ? 'person' : 'people'}</p>
        </div>
      )}
    </div>
  )
}
