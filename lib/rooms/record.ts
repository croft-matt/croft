import type { RoomReadModel } from '@/lib/blocks/types'

export type FactKind = 'time' | 'money' | 'place' | 'credential' | 'spec' | 'other'

export interface RecordFact {
  key: string
  value: string
  confidence: number
  email_id: string | null
  category: string | null
}

export interface RecordSection {
  kind: FactKind
  label: string
  facts: RecordFact[]
  categoryGroups: {
    category: string | null
    facts: RecordFact[]
  }[]
}

export interface RoomRecord {
  sections: RecordSection[]
  total: number
}

const KIND_ORDER: FactKind[] = ['time', 'money', 'place', 'credential', 'spec', 'other']

const KIND_LABELS: Record<FactKind, string> = {
  time: 'Dates',
  money: 'Money',
  place: 'Places',
  credential: 'Credentials',
  spec: 'Spec',
  other: 'Other',
}

export function assembleRecord(readModel: RoomReadModel): RoomRecord {
  // Bucket facts by kind. Preserve insertion order within each bucket.
  const byKind = new Map<FactKind, RecordFact[]>()

  for (const kind of KIND_ORDER) {
    byKind.set(kind, [])
  }

  for (const fact of readModel.facts) {
    const kind: FactKind = KIND_ORDER.includes(fact.kind as FactKind)
      ? (fact.kind as FactKind)
      : 'other'

    byKind.get(kind)!.push({
      key: fact.key,
      value: fact.value,
      confidence: fact.confidence,
      email_id: fact.email_id ?? null,
      category: fact.category ?? null,
    })
  }

  const sections: RecordSection[] = []

  for (const kind of KIND_ORDER) {
    const facts = byKind.get(kind)!
    if (facts.length === 0) continue

    // Group by category within the section, preserving insertion order.
    const groupMap = new Map<string | null, RecordFact[]>()

    for (const fact of facts) {
      const cat = fact.category ?? null
      const key = cat === null ? '__null__' : cat
      const group = groupMap.get(key) ?? []
      group.push(fact)
      groupMap.set(key, group)
    }

    const categoryGroups = Array.from(groupMap.entries()).map(([key, groupFacts]) => ({
      category: key === '__null__' ? null : key,
      facts: groupFacts,
    }))

    sections.push({
      kind,
      label: KIND_LABELS[kind],
      facts,
      categoryGroups,
    })
  }

  const total = sections.reduce((sum, s) => sum + s.facts.length, 0)

  return { sections, total }
}
