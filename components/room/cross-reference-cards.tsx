import Link from 'next/link'
import type { CrossReference } from '@/lib/queries/rooms'

interface CrossReferenceCardsProps {
  crossRefs: CrossReference[]
}

const MAX_SHOWN = 3

export function CrossReferenceCards({ crossRefs }: CrossReferenceCardsProps) {
  if (crossRefs.length === 0) return null

  const shown = crossRefs.slice(0, MAX_SHOWN)
  const remaining = crossRefs.length - MAX_SHOWN

  return (
    <div className="border-b border-border px-6 py-4 space-y-2">
      {shown.map((ref) => (
        <div
          key={ref.id}
          className="flex items-start gap-3 rounded-lg border-l-2 border-amber-500 bg-amber-500/5 pl-3 pr-4 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-xs text-amber-400 leading-snug">{ref.reason}</p>
            <Link
              href={`/rooms/${ref.linked_room_id}`}
              className="mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {ref.linked_room_name}
            </Link>
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground pl-1">and {remaining} more</p>
      )}
    </div>
  )
}
