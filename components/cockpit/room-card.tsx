import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'
import type { RoomCardRow } from '@/lib/queries/cockpit'

interface RoomCardProps {
  room: RoomCardRow
}

const FACT_KEYS = ['date', 'venue', 'location', 'address']

function extractFacts(roomData: Record<string, unknown>): string[] {
  const found: string[] = []

  function search(obj: unknown) {
    if (found.length >= 2) return
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (found.length >= 2) return
        const lKey = key.toLowerCase()
        // Handle both raw strings and stored fact shape { value, confidence }.
        const leafVal =
          typeof val === 'string'
            ? val
            : typeof val === 'object' && val !== null && 'value' in val && typeof (val as Record<string, unknown>).value === 'string'
              ? ((val as Record<string, unknown>).value as string)
              : null
        if (FACT_KEYS.some((k) => lKey.includes(k)) && leafVal && leafVal.trim()) {
          found.push(leafVal.trim())
        } else {
          search(val)
        }
      }
    }
  }

  search(roomData)
  return found
}

export function RoomCard({ room }: RoomCardProps) {
  const hasProg = room.progress_total > 0
  const pct = hasProg
    ? Math.round((room.progress_closed / room.progress_total) * 100)
    : 0
  const roomData = typeof room.room_data === 'object' && room.room_data !== null && !Array.isArray(room.room_data)
    ? (room.room_data as Record<string, unknown>)
    : {}
  const facts = extractFacts(roomData)

  return (
    <Link
      href={`/rooms/${room.id}`}
      className="block rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3.5 hover:bg-neutral-800 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-sm font-semibold text-white leading-snug truncate">{room.name}</p>
        {room.has_overdue && (
          <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
            overdue
          </span>
        )}
      </div>

      {hasProg && (
        <div className="mb-2.5 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-neutral-500 tabular-nums w-7 text-right">{pct}%</span>
        </div>
      )}

      {facts.length > 0 && (
        <p className="mb-1.5 text-xs text-neutral-500 truncate">
          {facts.join(' · ')}
        </p>
      )}

      <p className="text-xs text-neutral-600">
        <span>{room.progress_closed} closed</span>
        {room.progress_total > room.progress_closed && (
          <span> · {room.progress_total - room.progress_closed} open</span>
        )}
        {room.last_email_at && (
          <span> · last email {formatRelativeTime(room.last_email_at)}</span>
        )}
      </p>
    </Link>
  )
}
