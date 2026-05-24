import type { Asset, Contact, Job, Tables } from '@/lib/types/database'
import type { OpenLoops } from '@/lib/jobs/open-loops'

export type RoomBlockRow = Tables<'room_blocks'>

export interface Fact {
  category: string
  key: string
  value: string
  confidence: number
  // Defaults to 'other' when absent in stored data. Part 2 populates this from the model.
  kind: string
}

export interface RoomReadModel {
  workspaceId: string
  roomId: string
  openLoops: OpenLoops
  roomData: Record<string, unknown>
  facts: Fact[]
  assets: Asset[]
  contacts: Contact[]
  // All jobs for the room (open + closed). Needed by blocks that open the job modal.
  jobs: Job[]
  connectedAddresses: string[]
}

export interface BlockData {
  isEmpty: boolean
}

export interface BlockDefinition<TData extends BlockData = BlockData> {
  type: string
  title: string
  defaultActive: boolean
  hasEvidence(model: RoomReadModel): boolean
  resolve(model: RoomReadModel): TData
  preview(data: TData): string
}
