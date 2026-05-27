'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { triggerClassifyNow, getEmailExtractionData } from '@/lib/email/actions'
import type { Email, Job, Asset, ExtractedContact, Room, Extraction } from '@/lib/types/database'
import { ExtractionFlag } from '@/components/email/extraction-flag'
import { JobsList } from '@/components/email/jobs-list'
import { EmailBody } from '@/components/email/email-body'

interface EmailProcessingProviderProps {
  initialEmail: Email
  initialJobs: Job[]
  initialAssets: Asset[]
  initialExtractedContacts: ExtractedContact[]
  // Jobs closed by this email (closed_by_email_id = this email). Static — not updated by Realtime.
  initialClosedByJobs?: Job[]
  rooms: Pick<Room, 'id' | 'name'>[]
  workspaceId: string
}

export function EmailProcessingProvider({
  initialEmail,
  initialJobs,
  initialAssets,
  initialClosedByJobs = [],
}: EmailProcessingProviderProps) {
  const [email, setEmail] = useState(initialEmail)
  const [jobs, setJobs] = useState(initialJobs)
  const [assets, setAssets] = useState(initialAssets)

  const isProcessed = email.processing_state === 'processed'
  const extraction = email.extraction as Extraction | null

  useEffect(() => {
    if (!isProcessed) {
      void triggerClassifyNow(email.id)
    }

    const supabase = createClient()

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
            }
          }
        },
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

  return (
    <>
      {isProcessed ? (
        <div className="px-6 py-4 space-y-3">
          {email.subject_summary && (
            <div className="rounded-lg bg-muted/50 px-4 py-5 mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Latest
              </p>
              <p className="text-sm leading-relaxed text-foreground">
                {email.subject_summary}
              </p>
            </div>
          )}
          <JobsList jobs={jobs} assets={assets} closedByThisEmail={initialClosedByJobs} />
          {showFlag && <ExtractionFlag />}
        </div>
      ) : (
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <p className="text-sm">Extracting intelligence from this email...</p>
          </div>
        </div>
      )}

      <EmailBody email={email} defaultOpen={!isProcessed} />
    </>
  )
}
