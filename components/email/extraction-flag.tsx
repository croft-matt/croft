import { Flag } from 'lucide-react'

export function ExtractionFlag() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground px-1">
      <Flag className="h-3.5 w-3.5 shrink-0" />
      <p className="text-xs">I may have missed something in this one.</p>
    </div>
  )
}
