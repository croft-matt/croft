'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import type { DecisionsData } from '@/lib/blocks/decisions'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface DecisionsBlockProps {
  data: DecisionsData
}

export function DecisionsBlock({ data }: DecisionsBlockProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Decisions
      </p>

      {data.isEmpty ? (
        <p className="text-sm text-neutral-600">No decisions recorded yet.</p>
      ) : (
        <div className="divide-y divide-neutral-800">
          {data.decisions.map((decision) => {
            const meta = [
              decision.by_name ?? decision.owner,
              formatDate(decision.decided_at),
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <div key={decision.id} className="flex items-start gap-3 py-3 first:pt-0">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-100 leading-snug">{decision.statement}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {meta && (
                      <span className="text-xs text-neutral-500">{meta}</span>
                    )}
                    <Link
                      href={`/emails/${decision.email_id}`}
                      className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                    >
                      source
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
