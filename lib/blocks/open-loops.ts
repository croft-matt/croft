import type { BlockDefinition, BlockData, RoomReadModel } from './types'
import type { OpenLoop } from '@/lib/jobs/open-loops'

export interface OpenLoopsData extends BlockData {
  yourCourt: OpenLoop[]
  theirCourt: OpenLoop[]
}

export const openLoopsBlock: BlockDefinition<OpenLoopsData> = {
  type: 'open-loops',
  title: 'Open loops',
  defaultActive: true,
  hasEvidence(model: RoomReadModel): boolean {
    return model.openLoops.yourCourt.length > 0 || model.openLoops.theirCourt.length > 0
  },
  resolve(model: RoomReadModel): OpenLoopsData {
    const { yourCourt, theirCourt } = model.openLoops
    return {
      yourCourt,
      theirCourt,
      isEmpty: yourCourt.length === 0 && theirCourt.length === 0,
    }
  },
  preview(data: OpenLoopsData): string {
    const total = data.yourCourt.length + data.theirCourt.length
    return `${total} open ${total === 1 ? 'job' : 'jobs'}`
  },
}
