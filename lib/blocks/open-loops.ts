import type { BlockDefinition, BlockData, RoomReadModel } from './types'
import type { OpenLoop, OwnerGroup } from '@/lib/jobs/open-loops'

export interface OpenLoopsData extends BlockData {
  yourCourt: OpenLoop[]
  theirCourt: OpenLoop[]
  // Person-grouped version of theirCourt. Present on the server render path only.
  // The block renders from this when available, falling back to the flat theirCourt.
  theirCourtByPerson?: OwnerGroup[]
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
      theirCourtByPerson: model.theirCourtByPerson,
      isEmpty: yourCourt.length === 0 && theirCourt.length === 0,
    }
  },
  preview(data: OpenLoopsData): string {
    const total = data.yourCourt.length + data.theirCourt.length
    return `${total} open ${total === 1 ? 'job' : 'jobs'}`
  },
}
