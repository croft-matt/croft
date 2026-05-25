'use client'

import { useEffect, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { getEmailPanelData, type EmailPanelData } from '@/lib/email/actions'
import { EmailHeader } from '@/components/email/email-header'
import { EmailProcessingProvider } from '@/components/email/email-processing'

export function EmailSidePanel() {
  const { emailId, history, close, goBack } = useEmailSidePanel()
  const [data, setData] = useState<EmailPanelData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!emailId) {
      setData(null)
      return
    }

    setLoading(true)
    setData(null)

    getEmailPanelData(emailId).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [emailId])

  const canGoBack = history.length > 0

  return (
    <div className="w-full h-full flex flex-col border-l border-border overflow-y-auto bg-background">
      {/* Panel header: back button (when history exists) on the left, close on the right. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Narrow viewport only: "Back to room" affordance below the header. */}
      <button
        type="button"
        onClick={close}
        className="lg:hidden flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border shrink-0"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to room
      </button>

      {loading && (
        <div className="flex items-center gap-2 px-6 py-4 text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
          <p className="text-sm">Loading...</p>
        </div>
      )}

      {data && (
        <>
          <EmailHeader email={data.email} jobs={data.jobs} rooms={data.rooms} />
          <EmailProcessingProvider
            initialEmail={data.email}
            initialJobs={data.jobs}
            initialAssets={data.assets}
            initialExtractedContacts={data.extractedContacts}
            rooms={data.rooms}
            workspaceId={data.workspaceId}
          />
        </>
      )}
    </div>
  )
}
