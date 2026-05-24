'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LogisticsData, Place } from '@/lib/blocks/logistics'

// Heuristic: a value likely contains a postal address if it has a digit
// and either a comma or multiple words. Shows the copy affordance if true.
function looksLikeAddress(value: string): boolean {
  return /\d/.test(value) && (/,/.test(value) || value.trim().split(/\s+/).length >= 3)
}

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

interface LogisticsBlockProps {
  data: LogisticsData
}

export function LogisticsBlock({ data }: LogisticsBlockProps) {
  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Logistics
        </p>
        <p className="text-sm text-muted-foreground">No locations in this room yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Logistics
      </p>
      <div className="divide-y divide-border">
        {data.places.map((place, i) => (
          <PlaceRow key={i} place={place} />
        ))}
      </div>
    </div>
  )
}

function PlaceRow({ place }: { place: Place }) {
  const [copied, setCopied] = useState(false)
  const showCopy = looksLikeAddress(place.value)

  function handleCopy() {
    void navigator.clipboard.writeText(place.value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
          {formatLabel(place.label)}
        </p>
        <p className="text-sm text-foreground">{place.value}</p>
        {place.when && (
          <p className="text-xs text-muted-foreground mt-0.5">{place.when}</p>
        )}
      </div>
      {showCopy && (
        <button
          onClick={handleCopy}
          className={cn(
            'mt-0.5 shrink-0 rounded-md p-1.5 transition-colors',
            copied
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          aria-label="Copy address"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
