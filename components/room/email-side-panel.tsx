'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { getEmailPanelData, type EmailPanelData } from '@/lib/email/actions'
import { EmailHeader } from '@/components/email/email-header'
import { EmailProcessingProvider } from '@/components/email/email-processing'

// Renders the email detail view at 50% viewport width alongside the room content.
// Animation and thread navigation are implemented in Brief 35.
// Opened by calling useEmailSidePanel().open(emailId) from any tab row.
export function EmailSidePanel() {
  const { emailId, close } = useEmailSidePanel()
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

  return (
    <div className="w-1/2 flex flex-col border-l border-border overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-6 py-2.5">
        <span className="text-xs text-muted-foreground">Email</span>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
