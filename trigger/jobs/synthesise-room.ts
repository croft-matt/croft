import { task, tasks } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesiseRoom } from '@/lib/rooms/synthesise'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import type { generateRoomSummaryTask } from '@/trigger/jobs/generate-room-summary'

export interface SynthesiseRoomPayload {
  roomId: string
  emailId?: string
}

// Async room synthesis job. Enqueued after Tier 3 completes and after a job closes.
// Recalculates progress_total, progress_closed, and alert_text for the room.
// When emailId is provided, also merges extracted facts into room_data.
// The resulting rooms table UPDATE fires the Realtime rooms channel, patching
// room cards in the cockpit and room detail in place.
export const synthesiseRoomTask = task({
  id: 'synthesise-room',
  maxDuration: 60,
  // concurrencyLimit: 1 combined with a per-room concurrencyKey at the trigger
  // call site serializes synthesis runs for the same room, preventing the
  // lost-update race on room_data when multiple emails are classified at once.
  queue: { concurrencyLimit: 1 },
  run: async (payload: SynthesiseRoomPayload) => {
    const { roomId, emailId } = payload
    await synthesiseRoom(roomId, emailId)

    // Re-generate the room summary when a new email was processed into the room.
    // Not triggered on job-close path (emailId absent) to avoid redundant generation.
    if (emailId) {
      await tasks.trigger<typeof generateRoomSummaryTask>('generate-room-summary', { roomId })
    }

    // Broadcast the current total room count so the onboarding processing gate
    // can tick its rooms counter live. We look up workspace_id from the room
    // and count all rooms for that workspace after synthesis completes.
    const supabase = createAdminClient()
    const { data: room } = await supabase
      .from('rooms')
      .select('workspace_id')
      .eq('id', roomId)
      .single()

    if (room?.workspace_id) {
      const { count } = await supabase
        .from('rooms')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', room.workspace_id)

      await broadcastToWorkspace(room.workspace_id, 'room_created', { count: count ?? 0 })
    }

    return { roomId }
  },
})
