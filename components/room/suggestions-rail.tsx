'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import type { SuggestionEntry } from '@/lib/blocks/registry'
import { acceptBlock, dismissBlock } from '@/lib/blocks/actions'

interface SuggestionsRailProps {
  suggestions: SuggestionEntry[]
  roomId: string
}

export function SuggestionsRail({ suggestions, roomId }: SuggestionsRailProps) {
  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Suggested</p>
      <div className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <SuggestionCard key={s.type} suggestion={s} roomId={roomId} />
        ))}
      </div>
    </div>
  )
}

function SuggestionCard({
  suggestion,
  roomId,
}: {
  suggestion: SuggestionEntry
  roomId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const result = await acceptBlock(roomId, suggestion.type)
      if (!result.success) setError(result.error ?? 'Something went wrong.')
    })
  }

  function handleDismiss() {
    setError(null)
    startTransition(async () => {
      const result = await dismissBlock(roomId, suggestion.type)
      if (!result.success) setError(result.error ?? 'Something went wrong.')
    })
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/50 px-4 py-3 opacity-80">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-300">{suggestion.title}</p>
          {suggestion.preview && (
            <p className="text-xs text-neutral-600 mt-0.5">{suggestion.preview}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleAccept}
            disabled={isPending}
            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400 transition-colors disabled:opacity-50"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
