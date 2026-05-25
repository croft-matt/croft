'use client'

import { useEmailSidePanel } from '@/stores/email-side-panel-store'

interface EmailCitationProps {
  emailId: string
  label?: string
}

export function EmailCitation({ emailId, label = 'source' }: EmailCitationProps) {
  const { open } = useEmailSidePanel()

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        open(emailId)
      }}
      className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
    >
      {label}
    </button>
  )
}
