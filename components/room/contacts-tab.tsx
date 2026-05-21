import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import type { Contact } from '@/lib/types/database'

interface ContactsTabProps {
  contacts: Contact[]
}

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function ContactsTab({ contacts }: ContactsTabProps) {
  if (contacts.length === 0) {
    return <p className="text-sm text-neutral-600">No contacts in this room yet.</p>
  }

  return (
    <div className="space-y-2">
      {contacts.map((contact) => (
        <div
          key={contact.id}
          className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
        >
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
              hashNeutral(contact.email_address)
            )}
          >
            {getInitials(contact.name, contact.email_address)}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-100">
              {contact.name ?? contact.email_address}
            </p>
            {contact.role && (
              <p className="text-xs text-neutral-500">{contact.role}</p>
            )}
          </div>

          <div className="shrink-0 text-right space-y-0.5">
            <a
              href={`mailto:${contact.email_address}`}
              className="block text-xs text-neutral-400 hover:text-white transition-colors"
            >
              {contact.email_address}
            </a>
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="block text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                {contact.phone}
              </a>
            )}
            <p className="text-xs text-neutral-700">
              last email {formatRelativeTime(contact.last_seen_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
