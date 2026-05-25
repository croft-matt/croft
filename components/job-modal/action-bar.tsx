'use client'

import { Loader2, Send } from 'lucide-react'

interface ActionBarProps {
  onCancel: () => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}

export function ActionBar({ onCancel, onSubmit, loading, error }: ActionBarProps) {
  return (
    <div className="border-t border-border px-5 py-4">
      {error && (
        <p className="mb-3 text-xs text-red-400">{error}</p>
      )}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send
        </button>
      </div>
    </div>
  )
}
