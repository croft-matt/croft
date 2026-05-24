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
    <div className="border-t border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-3 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
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
          <div className="space-y-1 text-xs text-neutral-600">
            <p><span className="text-neutral-500">From:</span> {email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}</p>
            {(email.to_addresses as string[] | null)?.length ? (
              <p><span className="text-neutral-500">To:</span> {(email.to_addresses as string[]).join(', ')}</p>
            ) : null}
            {(email.cc_addresses as string[] | null)?.length ? (
              <p><span className="text-neutral-500">CC:</span> {(email.cc_addresses as string[]).join(', ')}</p>
            ) : null}
            {email.subject && (
              <p><span className="text-neutral-500">Subject:</span> {email.subject}</p>
            )}
          </div>

          {email.body_text ? (
            <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-500 leading-relaxed overflow-x-auto">
              {email.body_text}
            </pre>
          ) : (
            <p className="text-xs text-neutral-700">No plain text body available.</p>
          )}
        </div>
      )}
    </div>
  )
}
