import type { BlockDefinition, BlockData, RoomReadModel } from './types'

export interface DocumentItem {
  id: string
  filename: string
  mime_type: string | null
  likely_type: string | null
  status: string
  storage_path: string | null
  email_id: string | null
  created_at: string
}

export interface DocumentsData extends BlockData {
  groups: { type: string; items: DocumentItem[] }[]
}

const FALLBACK_TYPE = 'Other'

export const documentsBlock: BlockDefinition<DocumentsData> = {
  type: 'documents',
  title: 'Documents',
  defaultActive: false,
  hasEvidence(model: RoomReadModel): boolean {
    return model.assets.length > 0
  },
  resolve(model: RoomReadModel): DocumentsData {
    const grouped = new Map<string, DocumentItem[]>()

    for (const asset of model.assets) {
      const type = asset.likely_type ?? FALLBACK_TYPE
      const items = grouped.get(type) ?? []
      items.push({
        id: asset.id,
        filename: asset.filename,
        mime_type: asset.mime_type,
        likely_type: asset.likely_type,
        status: asset.status,
        storage_path: asset.storage_path,
        email_id: asset.email_id,
        created_at: asset.created_at,
      })
      grouped.set(type, items)
    }

    const groups = Array.from(grouped.entries()).map(([type, items]) => ({ type, items }))

    return {
      groups,
      isEmpty: groups.length === 0,
    }
  },
  preview(data: DocumentsData): string {
    const n = data.groups.reduce((sum, g) => sum + g.items.length, 0)
    return `${n} ${n === 1 ? 'file' : 'files'}`
  },
}
