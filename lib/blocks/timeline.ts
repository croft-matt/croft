import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export interface TimelineItem {
  date: string
  label: string
  kind: 'deadline' | 'done' | 'scheduled'
  source: 'job' | 'fact'
  ref_id: string
  email_id: string | null
  past: boolean
}

export interface TimelineData extends BlockData {
  items: TimelineItem[]
  nowIndex: number
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

    return {
      items,
      nowIndex: resolvedNowIndex,
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
