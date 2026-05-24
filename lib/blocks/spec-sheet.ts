import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export interface SpecGroup {
  category: string
  rows: { key: string; value: string }[]
}

export interface SpecSheetData extends BlockData {
  groups: SpecGroup[]
}

function formatValue(val: unknown): string {
  if (Array.isArray(val)) return val.map((v) => String(v)).join(', ')
  if (typeof val === 'string') return val
  return String(val)
}

export const specSheetBlock: BlockDefinition<SpecSheetData> = {
  type: 'spec-sheet',
  title: 'Project record',
  defaultActive: true,
  hideWhenEmpty: true,
  hasEvidence(model: RoomReadModel): boolean {
    return model.facts.length > 0
  },
  resolve(model: RoomReadModel): SpecSheetData {
    const grouped = new Map<string, { key: string; value: string }[]>()

    for (const fact of model.facts) {
      const rows = grouped.get(fact.category) ?? []
      rows.push({ key: fact.key, value: formatValue(fact.value) })
      grouped.set(fact.category, rows)
    }

    const groups: SpecGroup[] = Array.from(grouped.entries()).map(([category, rows]) => ({
      category,
      rows,
    }))

    return {
      groups,
      isEmpty: groups.length === 0,
    }
  },
  preview(data: SpecSheetData): string {
    const n = data.groups.reduce((sum, g) => sum + g.rows.length, 0)
    return `${n} ${n === 1 ? 'fact' : 'facts'}`
  },
}
