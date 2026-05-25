import type { RoomReadModel } from '@/lib/blocks/types'

export interface RoomDate {
  label: string
  value: string           // ISO date string (YYYY-MM-DD)
  confidence: number
  email_id: string | null
  is_delivery_date: boolean
}

export interface RoomDates {
  deliveryDate: RoomDate | null   // null if no qualifying date exists
  dates: RoomDate[]               // all time-kind dates, delivery date excluded
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Qualified means: in the future or within the last 7 days.
function isQualified(parsed: Date, sevenDaysAgo: Date): boolean {
  return parsed >= sevenDaysAgo
}

type FactCandidate = {
  source: 'fact'
  category: string
  key: string
  label: string
  value: string
  parsed: Date
  confidence: number
  email_id: string | null
}

type JobCandidate = {
  source: 'job'
  label: string
  value: string
  parsed: Date
  confidence: number
  email_id: string | null
}

type Candidate = FactCandidate | JobCandidate

export function assembleDates(readModel: RoomReadModel): RoomDates {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Collect all time-kind facts with valid dates.
  const allFactDates: FactCandidate[] = []

  for (const fact of readModel.facts) {
    if (fact.kind !== 'time') continue
    const parsed = parseDate(fact.value)
    if (!parsed) continue
    allFactDates.push({
      source: 'fact',
      category: fact.category,
      key: fact.key,
      label: fact.key,
      value: toISODate(parsed),
      parsed,
      confidence: fact.confidence,
      email_id: fact.email_id ?? null,
    })
  }

  // Build qualifying candidates from facts and open job deadlines.
  const qualifying: Candidate[] = []

  for (const fd of allFactDates) {
    if (isQualified(fd.parsed, sevenDaysAgo)) {
      qualifying.push(fd)
    }
  }

  for (const job of readModel.jobs) {
    if (job.status !== 'open' || !job.due) continue
    const parsed = parseDate(job.due)
    if (!parsed) continue
    if (isQualified(parsed, sevenDaysAgo)) {
      qualifying.push({
        source: 'job',
        label: job.description,
        value: toISODate(parsed),
        parsed,
        confidence: 1,
        email_id: job.email_id,
      })
    }
  }

  // Delivery date is the latest qualifying candidate.
  let best: Candidate | null = null
  for (const c of qualifying) {
    if (!best || c.parsed > best.parsed) {
      best = c
    }
  }

  let deliveryDate: RoomDate | null = null
  let deliveryFactRef: string | null = null

  if (best) {
    deliveryDate = {
      label: best.label,
      value: best.value,
      confidence: best.confidence,
      email_id: best.email_id,
      is_delivery_date: true,
    }
    if (best.source === 'fact') {
      deliveryFactRef = `${best.category}:${best.key}`
    }
  }

  // All time-kind facts excluding the one chosen as the delivery date.
  const dates: RoomDate[] = allFactDates
    .filter((fd) => {
      if (!deliveryFactRef) return true
      return `${fd.category}:${fd.key}` !== deliveryFactRef
    })
    .map((fd) => ({
      label: fd.label,
      value: fd.value,
      confidence: fd.confidence,
      email_id: fd.email_id,
      is_delivery_date: false,
    }))
    .sort((a, b) => a.value.localeCompare(b.value))

  return { deliveryDate, dates }
}
