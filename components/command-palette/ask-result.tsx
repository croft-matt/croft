'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import type { AskSource } from '@/stores/command-palette-store'

interface AskResultProps {
  query: string
  state: 'loading' | 'answer' | 'not_found' | 'error'
  answer?: string | null
  sources?: AskSource[] | null
  notFoundReason?: string | null
  onRetry: () => void
  onClose: () => void
}

export function AskResult({ query, state, answer, sources, notFoundReason, onRetry, onClose }: AskResultProps) {
  const router = useRouter()
  const { open: openSidePanel } = useEmailSidePanel()

  function handleSourceClick(source: AskSource) {
    switch (source.type) {
      case 'email':
        openSidePanel(source.id)
        onClose()
        break
      case 'asset':
        router.push(`/assets?id=${source.id}`)
        onClose()
        break
      case 'job':
        router.push(`/all-jobs`)
        onClose()
        break
      case 'room':
        router.push(`/rooms/${source.id}`)
        onClose()
        break
    }
  }

  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted-foreground mb-3">{query}</p>

      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Searching...
        </div>
      )}

      {state === 'answer' && answer && (
        <>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer}</p>
          {sources && sources.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {sources.map((s, i) => (
                <button
                  key={`${s.id}-${i}`}
                  className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => handleSourceClick(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {state === 'not_found' && (
        <div className="space-y-1">
          <p className="text-sm text-foreground">Nothing found.</p>
          {notFoundReason && (
            <p className="text-xs text-muted-foreground">{notFoundReason}</p>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Something went wrong.</p>
          <button className="text-xs text-primary hover:underline" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
