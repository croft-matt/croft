import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import {
  getEmailById,
  getJobsByEmailId,
  getAssetsByEmailId,
  getContactsMentionedInEmail,
  getRoomsForEmail,
} from '@/lib/queries/emails'
import { getRoomById } from '@/lib/queries/rooms'
import { EmailHeader } from '@/components/email/email-header'
import { ExtractionFlag } from '@/components/email/extraction-flag'
import { AssetsList } from '@/components/email/assets-list'
import { JobsList } from '@/components/email/jobs-list'
import { ContactsList } from '@/components/email/contacts-list'
import { EmailBody } from '@/components/email/email-body'

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

  const email = await getEmailById(id)
  if (!email) notFound()

  const [jobs, assets, rooms] = await Promise.all([
    getJobsByEmailId(id),
    getAssetsByEmailId(id),
    getRoomsForEmail(id),
  ])

  const extractedContacts = getContactsMentionedInEmail(email)

  // Resolve a friendly back label if we came from a specific room.
  let backLabel = parseFrom(from).label
  const backHref = parseFrom(from).href
  if (from?.startsWith('/rooms/')) {
    const roomId = from.replace('/rooms/', '').split('?')[0]
    const room = await getRoomById(roomId)
    if (room) backLabel = room.name
  }

  const isProcessed = email.processing_state === 'processed'
  const showFlag =
    isProcessed &&
    (email.extraction_complete === false ||
      (email.extraction?.confidence != null && email.extraction.confidence < 0.7))

  const keyDates = email.extraction?.entities?.dates ?? []

  return (
    <div className="flex flex-col min-h-full">
      {/* Back link */}
      <div className="border-b border-neutral-800 px-6 py-2.5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      </div>

      <EmailHeader email={email} jobs={jobs} rooms={rooms} />

      {isProcessed ? (
        <div className="flex flex-1 gap-6 p-6">
          {/* Left column: dates + assets */}
          <div className="w-[42%] shrink-0 space-y-4">
            {keyDates.length > 0 && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Key dates
                </p>
                <div className="divide-y divide-neutral-800">
                  {keyDates.map((d, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                      <span className="text-xs text-neutral-400 truncate">{d.context}</span>
                      <span className="text-xs font-medium text-neutral-200 whitespace-nowrap">
                        {new Date(d.date).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assets.length > 0 && <AssetsList assets={assets} />}

            {showFlag && <ExtractionFlag />}
          </div>

          {/* Right column: jobs + contacts */}
          <div className="flex-1 min-w-0 space-y-4">
            <JobsList jobs={jobs} />
            <ContactsList contacts={extractedContacts} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-6 p-6">
          <div className="w-[42%] shrink-0">
            <p className="text-sm text-neutral-600">Extracting intelligence from this email...</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-600">Extracting intelligence from this email...</p>
          </div>
        </div>
      )}

      <EmailBody email={email} defaultOpen={!isProcessed} />
    </div>
  )
}
