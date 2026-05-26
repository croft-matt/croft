'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'

export interface AssetSuggestion {
  id: string
  filename: string
  storage_path: string
  likely_type: string | null
  times_used: number
  created_at: string
}

// Extracts the most meaningful noun phrase from a job description
// to use as a search keyword against assets.likely_type.
// Strips common verb phrases that start job descriptions.
function extractKeyword(description: string): string {
  const stripped = description
    .toLowerCase()
    .replace(/^(send|deliver|provide|submit|attach|upload|share|forward|confirm|chase|request|get|obtain)\s+/, '')
    .split(/[.,;:!?]/)[0]
    .trim()

  // Take the first 3 words max as the keyword.
  return stripped.split(/\s+/).slice(0, 3).join(' ')
}

export async function suggestAsset(jobDescription: string): Promise<AssetSuggestion | null> {
  await requireUser()
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return null

  const keyword = extractKeyword(jobDescription)
  if (!keyword) return null

  const supabase = await createClient()

  // Find the most-used asset in the workspace matching the inferred type.
  // Uses a subquery via room_emails to count distinct rooms the asset has been used in.
  const { data } = await supabase
    .from('assets')
    .select('id, filename, storage_path, likely_type, created_at, email_id')
    .eq('workspace_id', workspaceId)
    .ilike('likely_type', `%${keyword}%`)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return null

  // Count distinct rooms per asset to find the most-used one.
  const emailIds = [...new Set(data.map((a) => a.email_id).filter((id): id is string => id !== null))]

  const { data: roomEmailRows } = await supabase
    .from('room_emails')
    .select('email_id, room_id')
    .in('email_id', emailIds)

  const emailToRoomCount: Record<string, number> = {}
  const emailToRooms: Record<string, Set<string>> = {}
  for (const re of roomEmailRows ?? []) {
    if (!emailToRooms[re.email_id]) emailToRooms[re.email_id] = new Set()
    emailToRooms[re.email_id].add(re.room_id)
  }
  for (const [emailId, rooms] of Object.entries(emailToRooms)) {
    emailToRoomCount[emailId] = rooms.size
  }

  // Sort by times_used desc, then created_at desc.
  const ranked = data.map((asset) => ({
    ...asset,
    times_used: asset.email_id ? (emailToRoomCount[asset.email_id] ?? 0) : 0,
  }))
  ranked.sort((a, b) => b.times_used - a.times_used || b.created_at.localeCompare(a.created_at))

  const top = ranked[0]
  if (!top.storage_path) return null

  return {
    id: top.id,
    filename: top.filename,
    storage_path: top.storage_path,
    likely_type: top.likely_type,
    times_used: top.times_used,
    created_at: top.created_at,
  }
}
