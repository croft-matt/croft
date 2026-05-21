import { Sparkles, Plus, FileText, File } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import type { AssetSuggestion } from '@/lib/jobs/suggest-asset'

interface AssetSuggestionCardProps {
  suggestion: AssetSuggestion
  onAttach: (suggestion: AssetSuggestion) => void
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext)) return <FileText className="h-4 w-4 text-neutral-400" />
  return <File className="h-4 w-4 text-neutral-400" />
}

function daysSince(dateString: string): number {
  return Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24))
}

export function AssetSuggestionCard({ suggestion, onAttach }: AssetSuggestionCardProps) {
  const isRecent = daysSince(suggestion.created_at) <= 30

  const subtext = [
    `Used in ${suggestion.times_used} previous ${suggestion.times_used === 1 ? 'room' : 'rooms'}`,
    isRecent ? formatRelativeTime(suggestion.created_at) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-neutral-600" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Suggested
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2.5">
        <div className="shrink-0">{getFileIcon(suggestion.filename)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-200 truncate">{suggestion.filename}</p>
          <p className="text-xs text-neutral-600 mt-0.5">{subtext}</p>
        </div>
        <button
          type="button"
          onClick={() => onAttach(suggestion)}
          className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors"
          title="Attach this file"
        >
          <Plus className="h-3.5 w-3.5" />
          Attach
        </button>
      </div>
    </div>
  )
}
