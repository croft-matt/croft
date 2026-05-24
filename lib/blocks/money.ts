import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export interface MoneyLine {
  label: string
  amount: string
  // email_id and stated_at are not available from the Fact type in v1.
  // They remain null until facts carry per-row provenance.
  email_id: string | null
  stated_at: string | null
}

export interface MoneyData extends BlockData {
  lines: MoneyLine[]
}

export const moneyBlock: BlockDefinition<MoneyData> = {
  type: 'money',
  title: 'Money',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    return model.facts.some((f) => f.kind === 'money')
  },
  resolve(model: RoomReadModel): MoneyData {
    const lines: MoneyLine[] = model.facts
      .filter((f) => f.kind === 'money')
      .map((f) => ({
        label: f.key,
        amount: f.value,
        email_id: null,
        stated_at: null,
      }))

    return {
      lines,
      isEmpty: lines.length === 0,
    }
  },
  preview(data: MoneyData): string {
    const n = data.lines.length
    return `${n} ${n === 1 ? 'figure' : 'figures'}`
  },
}
