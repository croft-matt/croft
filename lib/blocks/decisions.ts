import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export interface Decision {
  id: string
  statement: string
  by_name: string | null
  owner: string | null
  decided_at: string
  email_id: string
}

export interface DecisionsData extends BlockData {
  decisions: Decision[]
}

export const decisionsBlock: BlockDefinition<DecisionsData> = {
  type: 'decisions',
  title: 'Decisions',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    return model.jobs.some((j) => j.intent === 'CONFIRM')
  },
  resolve(model: RoomReadModel): DecisionsData {
    const decisions: Decision[] = model.jobs
      .filter((j) => j.intent === 'CONFIRM')
      .map((j) => ({
        id: j.id,
        statement: j.description,
        by_name: j.from_name,
        owner: j.owner,
        decided_at: j.closed_at ?? j.created_at,
        email_id: j.email_id,
      }))
      .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())

    return {
      decisions,
      isEmpty: decisions.length === 0,
    }
  },
  preview(data: DecisionsData): string {
    const n = data.decisions.length
    return `${n} ${n === 1 ? 'decision' : 'decisions'}`
  },
}
