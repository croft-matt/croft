import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import {
  getEmailById,
  getJobsByEmailId,
  getAssetsByEmailId,
  getContactsMentionedInEmail,
  getRoomsForEmail,
} from '@/lib/queries/emails'
import { getRoomById } from '@/lib/queries/rooms'
import { EmailHeader } from '@/components/email/email-header'
import { EmailProcessingProvider } from '@/components/email/email-processing'

function parseFrom(from: string | undefined): { label: string; href: string } {
  if (!from) return { label: 'Emails', href: '/emails' }
  if (from === 'cockpit') return { label: 'Cockpit', href: '/' }
  if (from.startsWith('/rooms/')) return { label: 'Room', href: from }
  return { label: 'Back', href: '/' }
}

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  await requireUser()
  const { id } = await params
  const { from } = await searchParams

  const [email, workspaceId] = await Promise.all([getEmailById(id), getWorkspaceId()])
  if (!email) notFound()
  if (!workspaceId) notFound()

  const [jobs, assets, rooms] = await Promise.all([
    getJobsByEmailId(id),
    getAssetsByEmailId(id),
    getRoomsForEmail(id),
  ])

  const extractedContacts = getContactsMentionedInEmail(email)

  // Resolve friendly room name for the back link if coming from a room.
  let backLabel = parseFrom(from).label
  const backHref = parseFrom(from).href
  if (from?.startsWith('/rooms/')) {
    const roomId = from.replace('/rooms/', '').split('?')[0]
    const room = await getRoomById(roomId)
    if (room) backLabel = room.name
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b border-border px-6 py-2.5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      </div>

      <EmailHeader email={email} jobs={jobs} rooms={rooms} />

      <EmailProcessingProvider
        initialEmail={email}
        initialJobs={jobs}
        initialAssets={assets}
        initialExtractedContacts={extractedContacts}
        rooms={rooms}
        workspaceId={workspaceId}
      />
    </div>
  )
}
