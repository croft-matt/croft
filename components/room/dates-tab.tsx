'use client'

import { cn } from '@/lib/utils'
import { EmailCitation } from '@/components/room/email-citation'
import { ConfidenceDot } from '@/components/ui/confidence-dot'
import type { RoomDate, RoomDates } from '@/lib/rooms/dates'

interface DatesTabProps {
  roomDates: RoomDates
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isPast(iso: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(iso) < today
}

function DateRow({ date }: { date: RoomDate }) {
  const past = isPast(date.value)

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3 first:pt-0',
        past && 'opacity-50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground tabular-nums">
            {formatDate(date.value)}
          </span>
          <ConfidenceDot confidence={date.confidence} />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{date.label}</p>
      </div>
      {date.email_id && <EmailCitation emailId={date.email_id} />}
    </div>
  )
}

export function DatesTab({ roomDates }: DatesTabProps) {
  const { deliveryDate, dates } = roomDates
  const isEmpty = !deliveryDate && dates.length === 0

  return (
    <div className="space-y-8">
      {/* Delivery date anchor: always rendered. */}
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Delivery date
        </p>

        {deliveryDate ? (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-semibold text-foreground tabular-nums">
                  {formatDate(deliveryDate.value)}
                </span>
                <ConfidenceDot confidence={deliveryDate.confidence} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{deliveryDate.label}</p>
            </div>
            {deliveryDate.email_id && (
              <EmailCitation emailId={deliveryDate.email_id} />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No delivery date found.</p>
        )}
      </section>

      {/* Date list: all time-kind dates excluding the delivery date. */}
      {!isEmpty && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            All dates
          </p>

          {dates.length === 0 ? null : (
            <div className="divide-y divide-border">
              {dates.map((date) => (
                <DateRow key={`${date.value}:${date.label}`} date={date} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Empty state: no delivery date and no date rows. */}
      {isEmpty && (
        <p className="text-sm text-muted-foreground">
          No dates have been extracted for this room.
        </p>
      )}
    </div>
  )
}
