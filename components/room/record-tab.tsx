'use client'

import { cn } from '@/lib/utils'
import { EmailCitation } from '@/components/room/email-citation'
import { ConfidenceDot } from '@/components/ui/confidence-dot'
import type { RoomRecord, RecordFact, RecordSection } from '@/lib/rooms/record'

interface RecordTabProps {
  record: RoomRecord
}

function FactRow({ fact }: { fact: RecordFact }) {
  return (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      <span className="w-48 shrink-0 text-xs text-muted-foreground">{fact.key}</span>
      <span className="flex-1 text-xs text-foreground">{fact.value}</span>
      <div className="flex items-center gap-2 shrink-0">
        <ConfidenceDot confidence={fact.confidence} />
        {fact.email_id && <EmailCitation emailId={fact.email_id} />}
      </div>
    </div>
  )
}

function Section({ section }: { section: RecordSection }) {
  const hasCategories = section.categoryGroups.some((g) => g.category !== null)

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3" id={`record-section-${section.kind}`}>
        <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
        <span className="text-xs text-muted-foreground">
          {section.facts.length} {section.facts.length === 1 ? 'fact' : 'facts'}
        </span>
      </div>

      <div className="space-y-4">
        {section.categoryGroups.map((group, i) => (
          <div key={group.category ?? `__ungrouped_${i}`}>
            {hasCategories && group.category && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {group.category}
              </p>
            )}
            <div
              className={cn(
                'divide-y divide-border',
                group.category && hasCategories && 'pl-0',
              )}
            >
              {group.facts.map((fact, j) => (
                <FactRow key={`${fact.key}-${j}`} fact={fact} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function RecordTab({ record }: RecordTabProps) {
  if (record.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No facts have been extracted for this room.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {/* Jump navigation: one pill per populated section in kind order. */}
      <nav className="flex flex-wrap gap-2">
        {record.sections.map((section) => (
          <a
            key={section.kind}
            href={`#record-section-${section.kind}`}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            {section.label}
          </a>
        ))}
      </nav>

      {record.sections.map((section) => (
        <Section key={section.kind} section={section} />
      ))}
    </div>
  )
}
