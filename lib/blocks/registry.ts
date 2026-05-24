import type { BlockDefinition, BlockData, RoomReadModel, RoomBlockRow } from './types'
import { openLoopsBlock } from './open-loops'
import { unansweredQuestionsBlock } from './unanswered-questions'
import { logisticsBlock } from './logistics'
import { documentsBlock } from './documents'
import { decisionsBlock } from './decisions'
import { specSheetBlock } from './spec-sheet'
import { moneyBlock } from './money'
import { timelineBlock } from './timeline'
import { expiriesBlock } from './expiries'

export const BLOCK_REGISTRY: BlockDefinition[] = [
  openLoopsBlock,
  specSheetBlock,
  unansweredQuestionsBlock,
  logisticsBlock,
  documentsBlock,
  decisionsBlock,
  moneyBlock,
  timelineBlock,
  expiriesBlock,
]

export interface StackEntry {
  type: string
  data: BlockData
}

export interface SuggestionEntry {
  type: string
  title: string
  preview: string
}

// Returns active blocks in display order.
// defaultActive blocks with no row sort before any accepted blocks.
// If a defaultActive block has a row (user moved it), its row.position is used.
export function resolveStack(
  model: RoomReadModel,
  rows: RoomBlockRow[],
): StackEntry[] {
  const rowMap = new Map(rows.map((r) => [r.block_type, r]))
  const entries: Array<{ type: string; data: BlockData; sortKey: number }> = []

  for (let i = 0; i < BLOCK_REGISTRY.length; i++) {
    const block = BLOCK_REGISTRY[i]
    const row = rowMap.get(block.type)

    if (row?.status === 'dismissed') continue

    if (block.defaultActive && !row) {
      const data = block.resolve(model)
      if (block.hideWhenEmpty && data.isEmpty) continue
      // Pin before all accepted blocks using a large negative sort key.
      entries.push({ type: block.type, data, sortKey: -10000 + i })
      continue
    }

    if (row?.status === 'active') {
      const data = block.resolve(model)
      if (block.hideWhenEmpty && data.isEmpty) continue
      entries.push({ type: block.type, data, sortKey: row.position })
    }
  }

  return entries
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ type, data }) => ({ type, data }))
}

// Returns blocks that have evidence but no room_blocks row — i.e. they should be suggested.
// defaultActive blocks are never suggested; they appear in the stack unless dismissed.
export function resolveSuggestions(
  model: RoomReadModel,
  rows: RoomBlockRow[],
): SuggestionEntry[] {
  const rowMap = new Map(rows.map((r) => [r.block_type, r]))
  const suggestions: SuggestionEntry[] = []

  for (const block of BLOCK_REGISTRY) {
    if (block.defaultActive) continue
    if (rowMap.has(block.type)) continue
    if (!block.hasEvidence(model)) continue

    const data = block.resolve(model)
    suggestions.push({
      type: block.type,
      title: block.title,
      preview: block.preview(data),
    })
  }

  return suggestions
}
