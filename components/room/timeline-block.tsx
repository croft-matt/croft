'use client'

import { useRef, useState, useCallback } from 'react'
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
  return 'bg-muted-foreground'
}

interface ItemRowProps {
  item: TimelineItem
  isHighlighted?: boolean
  isPulsing?: boolean
  rowRef?: (el: HTMLElement | null) => void
}

function ItemRow({ item, isHighlighted, isPulsing, rowRef }: ItemRowProps) {
  const isDone = item.kind === 'done'

  const dotOrIcon = isDone ? (
    <CheckCircle2
      className={cn(
        'mt-0.5 h-3.5 w-3.5 shrink-0',
        item.past ? 'text-muted' : 'text-muted-foreground',
      )}
    />
  ) : (
    <span
      className={cn(
        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
        item.past ? 'bg-muted' : deadlineDot(item.date),
      )}
    />
  )

  const content = (
    <div className={cn('min-w-0 flex-1', item.past && 'opacity-50')}>
      <p className={cn('text-sm leading-snug', item.past ? 'text-muted-foreground' : 'text-foreground')}>
        {item.label}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(item.date)}</p>
    </div>
  )

  const inner = (
    <div className="flex items-start gap-3 w-full">
      {dotOrIcon}
      {content}
    </div>
  )

  const highlightClass = cn(
    'transition-colors duration-150',
    isHighlighted && 'bg-muted rounded-lg',
    isPulsing && 'bg-muted rounded-lg',
  )

  if (item.email_id) {
    return (
      <Link
        ref={rowRef as React.Ref<HTMLAnchorElement>}
        href={`/emails/${item.email_id}`}
        className={cn('flex items-start py-3 first:pt-0 hover:opacity-80 transition-opacity', highlightClass)}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div
      ref={rowRef as React.Ref<HTMLDivElement>}
      className={cn('flex items-start py-3 first:pt-0', highlightClass)}
    >
      {inner}
    </div>
  )
}

function TimelineHero({ anchor }: { anchor: TimelineAnchor }) {
  const countdownText = anchor.daysRemaining === 0 ? 'today' : `${anchor.daysRemaining} days to go`
  return (
    <div className="mb-4 pb-4 border-b border-border">
      <p className="text-2xl font-semibold text-foreground leading-tight">{countdownText}</p>
      <p className="text-sm text-muted-foreground mt-0.5">
        {anchor.label}, {formatDate(anchor.date)}
      </p>
    </div>
  )
}

function timelineDotClass(item: TimelineItem): string {
  if (item.past) return 'bg-muted'
  if (item.kind === 'done') return 'bg-muted-foreground'
  return deadlineDot(item.date)
}

function xPercent(iso: string, start: number, span: number): number {
  if (span <= 0) return 100
  const t = new Date(iso).getTime()
  return Math.min(100, Math.max(0, ((t - start) / span) * 100))
}

interface RibbonProps {
  items: TimelineItem[]
  anchor: TimelineAnchor
  highlighted: string | null
  onHover: (ref_id: string | null) => void
  onClick: (ref_id: string) => void
}

function TimelineRibbon({ items, anchor, highlighted, onHover, onClick }: RibbonProps) {
  const today = new Date().toISOString().slice(0, 10)
  const startMs = new Date(items[0].date).getTime()
  const endMs = new Date(anchor.date).getTime()
  const span = endMs - startMs

  // Items plotted on the road: dated on or before the anchor, excluding the anchor itself
  const plotted = items.filter(
    (it) => it.date <= anchor.date && it.ref_id !== anchor.ref_id,
  )

  const todayPct = xPercent(today, startMs, span)
  const showNow = today >= items[0].date

  // Resolve the anchor item's email_id for linking
  const anchorItem = items.find((it) => it.ref_id === anchor.ref_id)
  const anchorEmailId = anchorItem?.email_id ?? null

  const anchorTitle = `${anchor.label}, ${formatDate(anchor.date)}`

  const endCapContent = (
    <div className="flex flex-col items-center gap-0.5">
      <span className="w-3.5 h-3.5 rounded-full bg-foreground ring-2 ring-background shrink-0" />
      <span className="text-[10px] text-foreground max-w-[80px] text-center leading-tight line-clamp-2 hidden sm:block">
        {anchor.label}
      </span>
    </div>
  )

  return (
    <div className="mb-4 pb-4 border-b border-border">
      {/* Road: pr-10 gives the end-cap room so it does not clip the card edge */}
      <div className="relative h-14 mx-1 pr-10">
        {/* Baseline */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-border -translate-y-1/2" />

        {/* Now marker */}
        {showNow && (
          <div
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${todayPct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-full w-px bg-muted-foreground" />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5 absolute -bottom-4">
              now
            </span>
          </div>
        )}

        {/* Plotted dots */}
        {plotted.map((item) => {
          const pct = xPercent(item.date, startMs, span)
          const label = `${item.label}, ${formatDate(item.date)}`
          return (
            <button
              key={item.ref_id}
              type="button"
              aria-label={label}
              title={label}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'transition-transform hover:scale-150',
                timelineDotClass(item),
                highlighted === item.ref_id && 'scale-150',
              )}
              style={{ left: `${pct}%` }}
              onMouseEnter={() => onHover(item.ref_id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onClick(item.ref_id)}
              onKeyDown={(e) => { if (e.key === 'Enter') onClick(item.ref_id) }}
            />
          )
        })}

        {/* Anchor end-cap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{ left: '100%' }}
        >
          {anchorEmailId ? (
            <Link
              href={`/emails/${anchorEmailId}`}
              aria-label={anchorTitle}
              title={anchorTitle}
              className="flex flex-col items-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {endCapContent}
            </Link>
          ) : (
            <div
              aria-label={anchorTitle}
              title={anchorTitle}
              className="flex flex-col items-center gap-0.5"
            >
              {endCapContent}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TimelineBlockProps {
  data: TimelineData
}

export function TimelineBlock({ data }: TimelineBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [pulsing, setPulsing] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())

  const setRowRef = useCallback((ref_id: string) => (el: HTMLElement | null) => {
    if (el) {
      rowRefs.current.set(ref_id, el)
    } else {
      rowRefs.current.delete(ref_id)
    }
  }, [])

  const handleDotClick = useCallback((ref_id: string) => {
    const el = rowRefs.current.get(ref_id)
    if (!el) return
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setPulsing(ref_id)
    setTimeout(() => setPulsing(null), 1000)
  }, [])

  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Timeline
        </p>
        <p className="text-sm text-muted-foreground">No dated events in this room yet.</p>
      </div>
    )
  }

  const past = data.items.slice(0, data.nowIndex)
  const upcoming = data.items.slice(data.nowIndex)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Timeline
      </p>

      {data.anchor && <TimelineHero anchor={data.anchor} />}

      {data.anchor && (
        <TimelineRibbon
          items={data.items}
          anchor={data.anchor}
          highlighted={highlighted}
          onHover={setHighlighted}
          onClick={handleDotClick}
        />
      )}

      <div className="divide-y divide-border">
        {past.map((item) => (
          <ItemRow
            key={item.ref_id}
            item={item}
            isHighlighted={highlighted === item.ref_id}
            isPulsing={pulsing === item.ref_id}
            rowRef={setRowRef(item.ref_id)}
          />
        ))}

        {past.length > 0 && upcoming.length > 0 && (
          <div className="flex items-center gap-2 py-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Now
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {upcoming.map((item) => (
          <ItemRow
            key={item.ref_id}
            item={item}
            isHighlighted={highlighted === item.ref_id}
            isPulsing={pulsing === item.ref_id}
            rowRef={setRowRef(item.ref_id)}
          />
        ))}
      </div>
    </div>
  )
}
