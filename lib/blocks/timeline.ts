import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export const ANCHOR_MIN_CONFIDENCE = 0.5

export interface TimelineItem {
  date: string
  label: string
  kind: 'deadline' | 'done' | 'scheduled'
  source: 'job' | 'fact'
  ref_id: string
  email_id: string | null
  past: boolean
}

export interface TimelineAnchor {
  date: string
  label: string
  daysRemaining: number
  source: 'fact' | 'job'
  ref_id: string
}

export interface TimelineData extends BlockData {
  items: TimelineItem[]
  nowIndex: number
  anchor: TimelineAnchor | null
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const timelineBlock: BlockDefinition<TimelineData> = {
  type: 'timeline',
  title: 'Timeline',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    let count = 0

    for (const job of model.jobs) {
      if (job.status === 'open' && job.due) count++
      if (job.status === 'closed' && job.closed_at) count++
      if (count >= 2) return true
    }

    for (const fact of model.facts) {
      if (fact.kind === 'time' && parseDate(fact.value)) {
        count++
        if (count >= 2) return true
      }
    }

    return false
  },
  resolve(model: RoomReadModel): TimelineData {
    const now = new Date()
    const today = toISODate(now)
    const items: TimelineItem[] = []

    for (const job of model.jobs) {
      if (job.status === 'open' && job.due) {
        items.push({
          date: job.due,
          label: job.description,
          kind: 'deadline',
          source: 'job',
          ref_id: job.id,
          email_id: job.email_id,
          past: job.due < today,
        })
      } else if (job.status === 'closed' && job.closed_at) {
        const closedDate = toISODate(new Date(job.closed_at))
        items.push({
          date: closedDate,
          label: job.description,
          kind: 'done',
          source: 'job',
          ref_id: job.id,
          email_id: job.email_id,
          past: closedDate < today,
        })
      }
    }

    for (const fact of model.facts) {
      if (fact.kind !== 'time') continue
      const parsed = parseDate(fact.value)
      if (!parsed) continue
      const dateStr = toISODate(parsed)
      items.push({
        date: dateStr,
        label: fact.key,
        kind: 'scheduled',
        source: 'fact',
        ref_id: `${fact.category}:${fact.key}`,
        email_id: null,
        past: dateStr < today,
      })
    }

    items.sort((a, b) => a.date.localeCompare(b.date))

    const nowIndex = items.findIndex((item) => item.date >= today)
    const resolvedNowIndex = nowIndex === -1 ? items.length : nowIndex

    // Derive the anchor: the latest future open item, preferring a scheduled fact
    // over a deadline on an equal date. Fact candidates are gated on confidence.
    const candidates = items.filter(
      (it) => !it.past && (it.kind === 'scheduled' || it.kind === 'deadline'),
    )

    const qualifiedCandidates = candidates.filter((it) => {
      if (it.kind === 'deadline') return true
      // scheduled items come from facts; look up confidence by ref_id (category:key)
      const colonIdx = it.ref_id.indexOf(':')
      const category = it.ref_id.slice(0, colonIdx)
      const key = it.ref_id.slice(colonIdx + 1)
      const fact = model.facts.find((f) => f.category === category && f.key === key)
      return fact !== undefined && fact.confidence >= ANCHOR_MIN_CONFIDENCE
    })

    // Sort descending by date; on equal dates prefer scheduled over deadline.
    qualifiedCandidates.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date)
      if (a.kind === 'scheduled' && b.kind !== 'scheduled') return -1
      if (b.kind === 'scheduled' && a.kind !== 'scheduled') return 1
      return 0
    })

    const anchorItem = qualifiedCandidates[0] ?? null

    let anchor: TimelineAnchor | null = null
    if (anchorItem) {
      const daysRemaining = Math.round(
        (new Date(anchorItem.date).getTime() - new Date(today).getTime()) / 86_400_000,
      )
      anchor = {
        date: anchorItem.date,
        label: anchorItem.label,
        daysRemaining,
        source: anchorItem.source,
        ref_id: anchorItem.ref_id,
      }
    }

    return {
      items,
      nowIndex: resolvedNowIndex,
      anchor,
      isEmpty: items.length === 0,
    }
  },
  preview(data: TimelineData): string {
    const upcoming = data.items.filter((i) => !i.past).length
    return upcoming > 0
      ? `${upcoming} upcoming`
      : `${data.items.length} ${data.items.length === 1 ? 'event' : 'events'}`
  },
}
