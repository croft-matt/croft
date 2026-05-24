import type { BlockDefinition, BlockData, RoomReadModel } from './types'

// Number of days within which a credential is considered expiring soon.
const EXPIRY_SOON_DAYS = 30

export interface Expiry {
  label: string
  detail: string
  expires_at: string
  days_remaining: number
  urgency: 'expired' | 'soon' | 'ok'
  email_id: string | null
}

export interface ExpiriesData extends BlockData {
  expiries: Expiry[]
}

function parseDate(value: string): Date | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export const expiriesBlock: BlockDefinition<ExpiriesData> = {
  type: 'expiries',
  title: 'Expiries',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    return model.facts.some((f) => f.kind === 'credential' && parseDate(f.value) !== null)
  },
  resolve(model: RoomReadModel): ExpiriesData {
    const now = new Date()
    const MS_PER_DAY = 1000 * 60 * 60 * 24

    const expiries: Expiry[] = []

    for (const fact of model.facts) {
      if (fact.kind !== 'credential') continue
      const date = parseDate(fact.value)
      if (!date) continue

      const days_remaining = Math.floor((date.getTime() - now.getTime()) / MS_PER_DAY)
      const urgency: Expiry['urgency'] =
        days_remaining < 0
          ? 'expired'
          : days_remaining <= EXPIRY_SOON_DAYS
            ? 'soon'
            : 'ok'

      expiries.push({
        label: fact.key,
        detail: fact.value,
        expires_at: date.toISOString().slice(0, 10),
        days_remaining,
        urgency,
        email_id: null,
      })
    }

    expiries.sort((a, b) => a.expires_at.localeCompare(b.expires_at))

    return {
      expiries,
      isEmpty: expiries.length === 0,
    }
  },
  preview(data: ExpiriesData): string {
    const expired = data.expiries.filter((e) => e.urgency === 'expired').length
    const soon = data.expiries.filter((e) => e.urgency === 'soon').length
    if (expired > 0) return `${expired} expired`
    if (soon > 0) return `${soon} expiring soon`
    return `${data.expiries.length} credentials`
  },
}
