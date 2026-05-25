'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Copy Croft address"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
