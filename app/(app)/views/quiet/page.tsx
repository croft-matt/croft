import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getWorkspaceId } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

interface QuietRoom {
  id: string
  name: string
  parent_name: string | null
  last_activity: string | null
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return 'No emails yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 1) return 'Last email 1 day ago'
  return `Last email ${days} days ago`
}

export default async function QuietRoomsPage() {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) notFound()

  const supabase = await createClient()

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch active rooms (not archived).
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, parent_room_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .is('archived_at', null)

  if (!rooms || rooms.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Quiet rooms</h1>
        <p className="text-sm text-muted-foreground">All rooms have recent activity.</p>
      </div>
    )
  }

  const roomIds = rooms.map((r) => r.id)

  // Get the most recent email per room via room_emails.
  const { data: recentEmails } = await supabase
    .from('room_emails')
    .select('room_id, email_id')
    .in('room_id', roomIds)

  // Get received_at for those emails.
  const emailIds = [...new Set((recentEmails ?? []).map((re) => re.email_id))]

  const emailReceivedMap = new Map<string, string>()
  if (emailIds.length > 0) {
    const { data: emails } = await supabase
      .from('emails')
      .select('id, received_at')
      .in('id', emailIds)
    for (const e of emails ?? []) {
      emailReceivedMap.set(e.id, e.received_at)
    }
  }

  // Build last activity per room.
  const roomLastActivity = new Map<string, string | null>()
  for (const room of rooms) {
    roomLastActivity.set(room.id, null)
  }
  for (const re of recentEmails ?? []) {
    const receivedAt = emailReceivedMap.get(re.email_id)
    if (!receivedAt) continue
    const current = roomLastActivity.get(re.room_id) ?? null
    if (!current || receivedAt > current) {
      roomLastActivity.set(re.room_id, receivedAt)
    }
  }

  // Filter to quiet rooms: no activity, or last activity older than cutoff.
  const quietRoomIds = rooms
    .filter((r) => {
      const last = roomLastActivity.get(r.id) ?? null
      return !last || last < cutoff
    })
    .map((r) => r.id)

  if (quietRoomIds.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-xl font-semibold text-foreground mb-6">Quiet rooms</h1>
        <p className="text-sm text-muted-foreground">All rooms have recent activity.</p>
      </div>
    )
  }

  // Resolve parent names.
  const parentIds = rooms
    .filter((r) => r.parent_room_id && quietRoomIds.includes(r.id))
    .map((r) => r.parent_room_id!)

  const parentNameMap = new Map<string, string>()
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('rooms')
      .select('id, name')
      .in('id', parentIds)
    for (const p of parents ?? []) {
      parentNameMap.set(p.id, p.name)
    }
  }

  const quietRooms: QuietRoom[] = rooms
    .filter((r) => quietRoomIds.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      parent_name: r.parent_room_id ? (parentNameMap.get(r.parent_room_id) ?? null) : null,
      last_activity: roomLastActivity.get(r.id) ?? null,
    }))
    .sort((a, b) => {
      if (!a.last_activity && !b.last_activity) return 0
      if (!a.last_activity) return -1
      if (!b.last_activity) return 1
      return a.last_activity < b.last_activity ? -1 : 1
    })

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-foreground mb-1">Quiet rooms</h1>
      <p className="text-sm text-muted-foreground mb-8">{quietRooms.length} {quietRooms.length === 1 ? 'room' : 'rooms'}</p>

      <div className="space-y-2">
        {quietRooms.map((room) => (
          <div key={room.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/rooms/${room.id}`}
                className="text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
              >
                {room.name}
              </Link>
              {room.parent_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{room.parent_name}</p>
              )}
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {formatLastActivity(room.last_activity)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
