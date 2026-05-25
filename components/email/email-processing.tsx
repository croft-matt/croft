'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { triggerClassifyNow, getEmailExtractionData } from '@/lib/email/actions'
import type { Email, Job, Asset, ExtractedContact, Room, Extraction } from '@/lib/types/database'
import { EmailHeader } from '@/components/email/email-header'
import { ExtractionFlag } from '@/components/email/extraction-flag'
import { AssetsList } from '@/components/email/assets-list'
import { JobsList } from '@/components/email/jobs-list'
import { ContactsList } from '@/components/email/contacts-list'
import { EmailBody } from '@/components/email/email-body'

interface EmailProcessingProviderProps {
  initialEmail: Email
  initialJobs: Job[]
  initialAssets: Asset[]
  initialExtractedContacts: ExtractedContact[]
  rooms: Pick<Room, 'id' | 'name'>[]
  workspaceId: string
}

export function EmailProcessingProvider({
  initialEmail,
  initialJobs,
  initialAssets,
  initialExtractedContacts,
  rooms,
  workspaceId,
}: EmailProcessingProviderProps) {
  const [email, setEmail] = useState(initialEmail)
  const [jobs, setJobs] = useState(initialJobs)
  const [assets, setAssets] = useState(initialAssets)
  const [extractedContacts, setExtractedContacts] = useState(initialExtractedContacts)

  const isProcessed = email.processing_state === 'processed'
  const extraction = email.extraction as Extraction | null

  useEffect(() => {
    // Fire on-demand Tier 3 if the email is not yet processed.
    if (!isProcessed) {
      void triggerClassifyNow(email.id)
    }

    const supabase = createClient()

    // Subscribe to processing_state changes for this email.
    const channel = supabase
      .channel(`email:${email.id}:state`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'emails',
          filter: `id=eq.${email.id}`,
        },
        async (payload) => {
          const updated = payload.new as Email
          setEmail((prev) => ({ ...prev, ...updated }))

          if (updated.processing_state === 'processed') {
            const data = await getEmailExtractionData(email.id)
            if (data) {
              setEmail(data.email)
              setJobs(data.jobs)
              setAssets(data.assets)
              setExtractedContacts(data.extractedContacts)
            }
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [email.id, isProcessed])

  const showFlag =
    isProcessed &&
    (email.extraction_complete === false ||
      (extraction?.confidence != null && extraction.confidence < 0.7))

  const keyDates = extraction?.entities?.dates ?? []

  return (
    <>
      {isProcessed ? (
        <div className="flex flex-1 gap-6 p-6">
          <div className="w-[42%] shrink-0 space-y-4">
            {keyDates.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Key dates
                </p>
                <div className="divide-y divide-border">
                  {keyDates.map((d, i) => (
                    <div key={i} className="flex items-start justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                      <span className="text-xs text-muted-foreground truncate">{d.context}</span>
                      <span className="text-xs font-medium text-foreground whitespace-nowrap">
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

          <div className="flex-1 min-w-0 space-y-4">
            <JobsList jobs={jobs} />
            <ContactsList contacts={extractedContacts} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-6 p-6">
          <div className="w-[42%] shrink-0">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              <p className="text-sm">Extracting intelligence from this email...</p>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
              <p className="text-sm">Extracting intelligence from this email...</p>
            </div>
          </div>
        </div>
      )}

      <EmailBody email={email} defaultOpen={!isProcessed} />
    </>
  )
}
