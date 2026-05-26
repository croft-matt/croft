import { createClient } from '@/lib/supabase/server'
import type { Asset } from '@/lib/types/database'

export interface RoomAsset {
  id: string
  filename: string
  likely_type: string | null
  status: 'received' | 'sent' | 'submitted' | 'accepted' | 'not_reviewed'
  status_updated_at: string | null
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  source: 'email_attachment' | 'user_upload'
  email_id: string | null
  from_name: string | null
  email_date: string
  created_at: string
}

export interface RoomAssets {
  received: RoomAsset[]
  sent: RoomAsset[]
  submitted: RoomAsset[]
  accepted: RoomAsset[]
  not_reviewed: RoomAsset[]
  total: number
  // Full Asset rows derived from the same query, for the read model.
  // Avoids a second getAssetsForRoom call on the room page.
  flat: Asset[]
}

const VALID_STATUSES = new Set(['received', 'sent', 'submitted', 'accepted', 'not_reviewed'])

const EMPTY: RoomAssets = {
  received: [],
  sent: [],
  submitted: [],
  accepted: [],
  not_reviewed: [],
  total: 0,
  flat: [],
}

export async function getRoomAssets(params: {
  workspaceId: string
  roomId: string
  emailIds?: string[]
}): Promise<RoomAssets> {
  const { workspaceId, roomId, emailIds } = params
  const supabase = await createClient()

  let ids: string[]
  if (emailIds !== undefined) {
    ids = emailIds
  } else {
    const { data: reData } = await supabase
      .from('room_emails')
      .select('email_id')
      .eq('room_id', roomId)
    ids = (reData ?? []).map((r) => r.email_id)
  }

  // Build query. Always include assets uploaded directly to this room (room_id match).
  // Also include email-derived assets if there are emails in the room (email_id match).
  let query = supabase
    .from('assets')
    .select('*, emails(from_name, received_at)')
    .not('storage_path', 'is', null)
    .eq('workspace_id', workspaceId)

  if (ids.length > 0) {
    query = query.or(`room_id.eq.${roomId},email_id.in.(${ids.join(',')})`)
  } else {
    query = query.eq('room_id', roomId)
  }

  const { data, error } = await query

  if (error || !data) return { ...EMPTY }

  const grouped: Record<RoomAsset['status'], RoomAsset[]> = {
    received: [],
    sent: [],
    submitted: [],
    accepted: [],
    not_reviewed: [],
  }
  const flat: Asset[] = []

  for (const row of data) {
    if (!row.storage_path) continue

    const status = row.status as string
    if (!VALID_STATUSES.has(status)) continue

    const typedStatus = status as RoomAsset['status']
    const emailJoin = row.emails as { from_name: string | null; received_at: string } | null

    // Determine source: fall back to 'email_attachment' for rows that pre-date the column.
    const source = (row.source as string) === 'user_upload' ? 'user_upload' : 'email_attachment'

    grouped[typedStatus].push({
      id: row.id,
      filename: row.filename,
      likely_type: row.likely_type,
      status: typedStatus,
      status_updated_at: row.status_updated_at,
      storage_path: row.storage_path,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      source,
      email_id: row.email_id ?? null,
      from_name: emailJoin?.from_name ?? null,
      email_date: emailJoin?.received_at ?? row.created_at,
      created_at: row.created_at,
    })

    flat.push({
      id: row.id,
      workspace_id: row.workspace_id,
      email_id: row.email_id ?? null,
      filename: row.filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      likely_type: row.likely_type,
      confidence: row.confidence,
      storage_path: row.storage_path,
      status: row.status,
      status_updated_at: row.status_updated_at,
      created_at: row.created_at,
    } as Asset)
  }

  // Sort each group by email_date desc (most recent first).
  for (const group of Object.values(grouped)) {
    group.sort((a, b) => b.email_date.localeCompare(a.email_date))
  }

  const total = flat.length

  return {
    received: grouped.received,
    sent: grouped.sent,
    submitted: grouped.submitted,
    accepted: grouped.accepted,
    not_reviewed: grouped.not_reviewed,
    total,
    flat,
  }
}
