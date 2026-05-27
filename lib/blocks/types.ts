import type { Asset, Contact, Tables } from '@/lib/types/database'
import type { OpenLoops, OwnerGroup } from '@/lib/jobs/open-loops'

export type RoomBlockRow = Tables<'room_blocks'>

export interface Fact {
  category: string
  key: string
  value: string
  confidence: number
  // Defaults to 'other' when absent in stored data. Part 2 populates this from the model.
  kind: string
  // Source email for citation. Absent on facts written before this field was added.
  email_id?: string | null
}

// All non-cancelled jobs for the room, enriched with the sender name from the source email.
// intent and status are narrowed from the database string type.
export interface RoomJob {
  id: string
  intent: 'REQUEST' | 'DELIVER' | 'CONFIRM' | 'CHASE' | 'QUERY' | 'INTRODUCE'
  description: string
  owner: string | null
  due: string | null
  status: 'open' | 'closed' | 'cancelled'
  closed_at: string | null
  closed_by_email_id: string | null
  closed_by_from_name: string | null
  parent_job_id: string | null
  email_id: string
  from_name: string | null
  created_at: string
}

export interface RoomReadModel {
  workspaceId: string
  roomId: string
  openLoops: OpenLoops
  // Person-grouped awaiting-others. Only populated on the server render path
  // (assembleReadModel). The realtime client path cannot make async DB calls
  // so this field is absent there; open-loops-block falls back to the flat
  // openLoops.theirCourt in that case.
  theirCourtByPerson?: OwnerGroup[]
  roomData: Record<string, unknown>
  facts: Fact[]
  assets: Asset[]
  contacts: Contact[]
  // All non-cancelled jobs for the room (open + closed), with from_name from source email.
  // openLoops is the ranked open subset; both are derived from the same source.
  jobs: RoomJob[]
  connectedAddresses: string[]
}

export interface BlockData {
  isEmpty: boolean
}

export interface BlockDefinition<TData extends BlockData = BlockData> {
  type: string
  title: string
  defaultActive: boolean
  // When true, a block whose resolved data has isEmpty: true is omitted from
  // the stack entirely rather than rendering a quiet-line placeholder.
  // Use for catch-all blocks (e.g. spec sheet) where an empty state adds no value.
  hideWhenEmpty?: boolean
  hasEvidence(model: RoomReadModel): boolean
  resolve(model: RoomReadModel): TData
  preview(data: TData): string
}
