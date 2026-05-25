'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Email } from '@/lib/types/database'

interface EmailBodyProps {
  email: Email
  defaultOpen?: boolean
}

export function EmailBody({ email, defaultOpen = false }: EmailBodyProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Original email
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-3">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><span className="text-muted-foreground">From:</span> {email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}</p>
            {(email.to_addresses as string[] | null)?.length ? (
              <p><span className="text-muted-foreground">To:</span> {(email.to_addresses as string[]).join(', ')}</p>
            ) : null}
            {(email.cc_addresses as string[] | null)?.length ? (
              <p><span className="text-muted-foreground">CC:</span> {(email.cc_addresses as string[]).join(', ')}</p>
            ) : null}
            {email.subject && (
              <p><span className="text-muted-foreground">Subject:</span> {email.subject}</p>
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
