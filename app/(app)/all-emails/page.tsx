import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { getAllEmails } from '@/lib/queries/all-emails'
import { AllEmailsRealtime } from '@/components/email/all-emails-realtime'

export default async function AllEmailsPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const emails = await getAllEmails(workspaceId)

  return (
    <div className="px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">All emails</h1>
      <p className="text-sm text-muted-foreground mb-10">
        {emails.length === 0
          ? 'No emails yet.'
          : `${emails.length} ${emails.length === 1 ? 'email' : 'emails'} across all rooms`}
      </p>

      <AllEmailsRealtime workspaceId={workspaceId} initialEmails={emails} />
    </div>
  )
}
