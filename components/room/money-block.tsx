'use client'

import type { MoneyData } from '@/lib/blocks/money'

function formatLabel(str: string): string {
  return str.replace(/_/g, ' ')
}

interface MoneyBlockProps {
  data: MoneyData
}

export function MoneyBlock({ data }: MoneyBlockProps) {
  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Money
        </p>
        <p className="text-sm text-muted-foreground">No figures in this room yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          Money
        </p>
        <p className="text-[13px] text-muted-foreground">
          {data.lines.length} {data.lines.length === 1 ? 'figure' : 'figures'}
        </p>
      </div>

      <div className="divide-y divide-border">
        {data.lines.map((line, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <span className="text-xs text-muted-foreground capitalize">
              {formatLabel(line.label)}
            </span>
            <span className="text-sm font-medium text-foreground tabular-nums">
              {line.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
