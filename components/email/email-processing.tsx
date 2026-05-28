'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { triggerClassifyNow, getEmailExtractionData } from '@/lib/email/actions'
import type { Email, Job, Asset, ExtractedContact, Room, Extraction } from '@/lib/types/database'
import { ExtractionFlag } from '@/components/email/extraction-flag'
import { JobsList } from '@/components/email/jobs-list'
import { cn } from '@/lib/utils'

interface EmailProcessingProviderProps {
  initialEmail: Email
  initialJobs: Job[]
  initialAssets: Asset[]
  initialExtractedContacts: ExtractedContact[]
  // Jobs closed by this email (closed_by_email_id = this email). Static — not updated by Realtime.
  initialClosedByJobs?: Job[]
  rooms: Pick<Room, 'id' | 'name'>[]
  workspaceId: string
  initialTab?: 'jobs' | 'email'
}

export function EmailProcessingProvider({
  initialEmail,
  initialJobs,
  initialAssets,
  initialClosedByJobs = [],
  initialTab = 'jobs',
}: EmailProcessingProviderProps) {
  const [email, setEmail] = useState(initialEmail)
  const [jobs, setJobs] = useState(initialJobs)
  const [assets, setAssets] = useState(initialAssets)
  const [activeTab, setActiveTab] = useState<'jobs' | 'email'>(initialTab)

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
    <div className="px-6 py-4 space-y-4">
      {/* Latest summary — always visible when processed */}
      {isProcessed && email.subject_summary && (
        <div className="rounded-lg bg-muted/50 px-4 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Latest
          </p>
          <p className="text-sm leading-relaxed text-foreground">{email.subject_summary}</p>
        </div>
      )}

      {/* Processing state — shown instead of tabs while not yet processed */}
      {!isProcessed && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
          <p className="text-sm">Extracting intelligence from this email...</p>
        </div>
      )}

      {/* Tab bar — only shown once processed */}
      {isProcessed && (
        <>
          <div className="flex gap-2">
            {(['jobs', 'email'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'h-[27px] px-[10px] text-xs font-medium rounded-full transition-colors inline-flex items-center cursor-pointer',
                  activeTab === tab
                    ? 'dark:bg-[#202021] bg-secondary dark:text-white text-foreground'
                    : 'dark:bg-[#141415] bg-muted dark:text-[#949496] text-muted-foreground dark:hover:text-white hover:text-foreground',
                )}
                style={{ boxShadow: activeTab === tab ? 'var(--tab-active-shadow)' : 'var(--tab-inactive-shadow)' }}
              >
                {tab === 'jobs' ? 'Jobs' : 'Email'}
              </button>
            ))}
          </div>

          {/* Jobs tab */}
          {activeTab === 'jobs' && (
            <div className="space-y-3">
              <JobsList jobs={jobs} assets={assets} closedByThisEmail={initialClosedByJobs} />
              {showFlag && <ExtractionFlag />}
            </div>
          )}

          {/* Email tab */}
          {activeTab === 'email' && (
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="text-muted-foreground/60">From:</span>{' '}
                  {email.from_name
                    ? `${email.from_name} <${email.from_address}>`
                    : email.from_address}
                </p>
                {(email.to_addresses as string[] | null)?.length ? (
                  <p>
                    <span className="text-muted-foreground/60">To:</span>{' '}
                    {(email.to_addresses as string[]).join(', ')}
                  </p>
                ) : null}
                {(email.cc_addresses as string[] | null)?.length ? (
                  <p>
                    <span className="text-muted-foreground/60">CC:</span>{' '}
                    {(email.cc_addresses as string[]).join(', ')}
                  </p>
                ) : null}
                {email.subject && (
                  <p>
                    <span className="text-muted-foreground/60">Subject:</span> {email.subject}
                  </p>
                )}
              </div>

              {email.body_text ? (
                <div className="whitespace-pre-wrap text-xs text-foreground leading-relaxed">
                  {email.body_text}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No plain text body available.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Email tab always available — even while processing */}
      {!isProcessed && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="text-muted-foreground/60">From:</span>{' '}
              {email.from_name
                ? `${email.from_name} <${email.from_address}>`
                : email.from_address}
            </p>
            {(email.to_addresses as string[] | null)?.length ? (
              <p>
                <span className="text-muted-foreground/60">To:</span>{' '}
                {(email.to_addresses as string[]).join(', ')}
              </p>
            ) : null}
            {(email.cc_addresses as string[] | null)?.length ? (
              <p>
                <span className="text-muted-foreground/60">CC:</span>{' '}
                {(email.cc_addresses as string[]).join(', ')}
              </p>
            ) : null}
            {email.subject && (
              <p>
                <span className="text-muted-foreground/60">Subject:</span> {email.subject}
              </p>
            )}
          </div>

          {email.body_text ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground leading-relaxed overflow-x-auto">
              {email.body_text}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">No plain text body available.</p>
          )}
        </div>
      )}
    </div>
  )
}
