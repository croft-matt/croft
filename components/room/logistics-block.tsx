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
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Logistics
        </p>
        <p className="text-sm text-neutral-600">No locations in this room yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Logistics
      </p>
      <div className="divide-y divide-neutral-800">
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
        <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-0.5">
          {formatLabel(place.label)}
        </p>
        <p className="text-sm text-neutral-100">{place.value}</p>
        {place.when && (
          <p className="text-xs text-neutral-500 mt-0.5">{place.when}</p>
        )}
      </div>
      {showCopy && (
        <button
          onClick={handleCopy}
          className={cn(
            'mt-0.5 shrink-0 rounded-md p-1.5 transition-colors',
            copied
              ? 'text-neutral-300'
              : 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400',
          )}
          aria-label="Copy address"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
