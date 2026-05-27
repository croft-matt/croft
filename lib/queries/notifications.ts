import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface NotificationRow {
  id: string
  type: 'job_created' | 'job_updated' | 'job_closed' | 'email_received'
  summary: string
  room_id: string | null
  room_name: string | null
  email_id: string | null
  job_id: string | null
  read_at: string | null
  created_at: string
}

// Fetch the most recent 100 notifications for the workspace.
export async function getNotifications(workspaceId: string): Promise<NotificationRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, summary, room_id, email_id, job_id, read_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('getNotifications error:', error.message)
    return []
  }

  const rows = data ?? []

  // Attach room names.
  const roomIds = [...new Set(rows.map((r) => r.room_id).filter((id): id is string => id !== null))]
  const roomNameById = new Map<string, string>()
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name')
      .in('id', roomIds)
    for (const r of rooms ?? []) roomNameById.set(r.id, r.name)
  }

  return rows.map((r) => ({
    id: r.id,
    type: r.type as NotificationRow['type'],
    summary: r.summary,
    room_id: r.room_id,
    room_name: r.room_id ? (roomNameById.get(r.room_id) ?? null) : null,
    email_id: r.email_id,
    job_id: r.job_id,
    read_at: r.read_at,
    created_at: r.created_at,
  }))
}

// Count unread notifications.
export async function getUnreadCount(workspaceId: string): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('read_at', null)

  if (error) return 0
  return count ?? 0
}

// Mark all notifications as read for the workspace. Called server-side from the feed page.
export async function markAllRead(workspaceId: string): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  await supabase
    .from('notifications')
    .update({ read_at: now })
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
}
