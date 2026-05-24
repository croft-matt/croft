'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineAnchor, TimelineData, TimelineItem } from '@/lib/blocks/timeline'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function deadlineDot(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  if (date < now) return 'bg-red-500'
  if (date < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-neutral-500'
}

function ItemRow({ item }: { item: TimelineItem }) {
  const isDone = item.kind === 'done'

  const dotOrIcon = isDone ? (
    <CheckCircle2
      className={cn(
        'mt-0.5 h-3.5 w-3.5 shrink-0',
        item.past ? 'text-neutral-700' : 'text-neutral-500',
      )}
    />
  ) : (
    <span
      className={cn(
        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
        item.past ? 'bg-neutral-700' : deadlineDot(item.date),
      )}
    />
  )

  const content = (
    <div className={cn('min-w-0 flex-1', item.past && 'opacity-50')}>
      <p className={cn('text-sm leading-snug', item.past ? 'text-neutral-400' : 'text-neutral-100')}>
        {item.label}
      </p>
      <p className="text-xs text-neutral-500 mt-0.5">{formatDate(item.date)}</p>
    </div>
  )

  const inner = (
    <div className="flex items-start gap-3 w-full">
      {dotOrIcon}
      {content}
    </div>
  )

  if (item.email_id) {
    return (
      <Link
        href={`/emails/${item.email_id}`}
        className="flex items-start py-3 first:pt-0 hover:opacity-80 transition-opacity"
      >
        {inner}
      </Link>
    )
  }

  return <div className="flex items-start py-3 first:pt-0">{inner}</div>
}

function TimelineHero({ anchor }: { anchor: TimelineAnchor }) {
  const countdownText = anchor.daysRemaining === 0 ? 'today' : `${anchor.daysRemaining} days to go`
  return (
    <div className="mb-4 pb-4 border-b border-neutral-800">
      <p className="text-2xl font-semibold text-neutral-100 leading-tight">{countdownText}</p>
      <p className="text-sm text-neutral-500 mt-0.5">
        {anchor.label}, {formatDate(anchor.date)}
      </p>
    </div>
  )
}

interface TimelineBlockProps {
  data: TimelineData
}

export function TimelineBlock({ data }: TimelineBlockProps) {
  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Timeline
        </p>
        <p className="text-sm text-neutral-600">No dated events in this room yet.</p>
      </div>
    )
  }

  const past = data.items.slice(0, data.nowIndex)
  const upcoming = data.items.slice(data.nowIndex)

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Timeline
      </p>

      {data.anchor && <TimelineHero anchor={data.anchor} />}

      <div className="divide-y divide-neutral-800">
        {past.map((item) => (
          <ItemRow key={item.ref_id} item={item} />
        ))}

        {past.length > 0 && upcoming.length > 0 && (
          <div className="flex items-center gap-2 py-2">
            <div className="h-px flex-1 bg-neutral-700" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              Now
            </span>
            <div className="h-px flex-1 bg-neutral-700" />
          </div>
        )}

        {upcoming.map((item) => (
          <ItemRow key={item.ref_id} item={item} />
        ))}
      </div>
    </div>
  )
}
