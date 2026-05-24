'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ExpiriesData, Expiry } from '@/lib/blocks/expiries'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCountdown(days: number): string {
  if (days === 0) return 'expires today'
  if (days < 0) {
    const n = Math.abs(days)
    return `expired ${n} ${n === 1 ? 'day' : 'days'} ago`
  }
  return `expires in ${days} ${days === 1 ? 'day' : 'days'}`
}

function urgencyDot(urgency: Expiry['urgency']): string {
  if (urgency === 'expired') return 'bg-red-500'
  if (urgency === 'soon') return 'bg-amber-500'
  return 'bg-neutral-500'
}

function urgencyLabel(urgency: Expiry['urgency']): string {
  if (urgency === 'expired') return 'text-red-400'
  if (urgency === 'soon') return 'text-amber-400'
  return 'text-neutral-500'
}

function formatLabel(str: string): string {
  return str.replace(/_/g, ' ')
}

interface ExpiriesBlockProps {
  data: ExpiriesData
}

export function ExpiriesBlock({ data }: ExpiriesBlockProps) {
  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Expiries
        </p>
        <p className="text-sm text-neutral-600">No expiring credentials in this room.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Expiries
      </p>

      <div className="divide-y divide-neutral-800">
        {data.expiries.map((expiry) => {
          const row = (
            <div className="flex items-start gap-3 py-3 first:pt-0 w-full">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', urgencyDot(expiry.urgency))} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-100 capitalize">{formatLabel(expiry.label)}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{formatDate(expiry.expires_at)}</p>
              </div>
              <span className={cn('text-xs font-medium shrink-0 text-right', urgencyLabel(expiry.urgency))}>
                {formatCountdown(expiry.days_remaining)}
              </span>
            </div>
          )

          if (expiry.email_id) {
            return (
              <Link
                key={expiry.label}
                href={`/emails/${expiry.email_id}`}
                className="flex items-start hover:opacity-80 transition-opacity"
              >
                {row}
              </Link>
            )
          }

          return <div key={expiry.label}>{row}</div>
        })}
      </div>
    </div>
  )
}
