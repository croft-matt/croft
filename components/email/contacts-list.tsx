import { cn } from '@/lib/utils'
import type { ExtractedContact } from '@/lib/types/database'

interface ContactsListProps {
  contacts: ExtractedContact[]
}

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (name.length >= 2) return name.slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

export function ContactsList({ contacts }: ContactsListProps) {
  if (contacts.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        Contacts
      </p>
      <div className="space-y-3">
        {contacts.map((contact, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white',
                hashNeutral(contact.email ?? contact.name)
              )}
            >
              {getInitials(contact.name, contact.email ?? '')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
                {contact.role && (
                  <p className="text-xs text-muted-foreground truncate">{contact.role}</p>
                )}
            </div>
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {contact.email}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
