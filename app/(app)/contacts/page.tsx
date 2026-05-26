import Link from 'next/link'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { getWorkspaceContactsWithMeta } from '@/lib/queries/contacts'
import { ContactsList } from '@/components/contacts/contacts-list'
import { GitMerge } from 'lucide-react'

export default async function ContactsPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()

  const contacts = workspaceId
    ? await getWorkspaceContactsWithMeta(workspaceId)
    : []

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contacts.length} {contacts.length === 1 ? 'person' : 'people'} across your workspace
          </p>
        </div>
        <Link
          href="/contacts/duplicates"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
        >
          <GitMerge className="h-3.5 w-3.5" />
          Duplicates
        </Link>
      </div>

      <ContactsList contacts={contacts} />
    </div>
  )
}
