'use client'

import type { SpecSheetData } from '@/lib/blocks/spec-sheet'

function formatLabel(str: string): string {
  return str.replace(/_/g, ' ')
}

interface SpecSheetBlockProps {
  data: SpecSheetData
}

export function SpecSheetBlock({ data }: SpecSheetBlockProps) {
  if (data.isEmpty) return null

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Project record
      </p>

      <div className="space-y-4">
        {data.groups.map(({ category, rows }) => (
          <div key={category}>
            <p className="text-[13px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
              {formatLabel(category)}
            </p>
            <div className="divide-y divide-border">
              {rows.map(({ key, value }) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 py-1.5 first:pt-0 last:pb-0"
                >
                  <span className="text-xs text-muted-foreground capitalize shrink-0">
                    {formatLabel(key)}
                  </span>
                  <span className="text-xs font-medium text-foreground text-right">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
