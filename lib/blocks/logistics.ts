import type { BlockDefinition, BlockData, RoomReadModel, Fact } from './types'

export interface Place {
  // The fact key, rendered as the model produced it (e.g. "venue", "site", "load_in_address").
  label: string
  // The address or location as stated in the email.
  value: string
  // An associated time fact from the same category, if present.
  when: string | null
}

export interface LogisticsData extends BlockData {
  places: Place[]
}

// Groups time facts by category for pairing with place facts.
function buildTimeIndex(facts: Fact[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const fact of facts) {
    if (fact.kind === 'time') {
      // Use the first time fact found for each category as the associated window.
      if (!index.has(fact.category)) {
        index.set(fact.category, fact.value)
      }
    }
  }
  return index
}

export const logisticsBlock: BlockDefinition<LogisticsData> = {
  type: 'logistics',
  title: 'Logistics',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    return model.facts.some((f) => f.kind === 'place')
  },
  resolve(model: RoomReadModel): LogisticsData {
    const timeByCategory = buildTimeIndex(model.facts)

    const places: Place[] = model.facts
      .filter((f) => f.kind === 'place')
      .map((f) => ({
        label: f.key,
        value: f.value,
        when: timeByCategory.get(f.category) ?? null,
      }))

    return {
      places,
      isEmpty: places.length === 0,
    }
  },
  preview(data: LogisticsData): string {
    const n = data.places.length
    return `${n} ${n === 1 ? 'location' : 'locations'}`
  },
}
