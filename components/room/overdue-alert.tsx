import { AlertTriangle } from 'lucide-react'

interface OverdueAlertProps {
  alertText: string
}

export function OverdueAlert({ alertText }: OverdueAlertProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-500/20 bg-amber-500/5 px-6 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-sm text-amber-400 truncate">{alertText}</p>
      </div>
      <button
        type="button"
        disabled
        className="shrink-0 rounded-md border border-border px-3 py-1 text-xs text-muted-foreground cursor-not-allowed"
        title="Draft reply coming soon"
      >
        Draft reply
      </button>
    </div>
  )
}
