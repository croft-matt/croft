import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRoomSummaryTask } from './generate-room-summary'

// One-time backfill task. Finds all rooms that have emails and room_data but
// no room_summary yet, and enqueues generate-room-summary for each.
// Safe to run multiple times: rooms that already have a summary are skipped.
// Trigger from the Trigger.dev dashboard with no payload required.
export const backfillRoomSummariesTask = task({
  id: 'backfill-room-summaries',
  maxDuration: 600,
  run: async () => {
    const supabase = createAdminClient()

    // Rooms with non-empty room_data and no summary yet.
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('id')
      .neq('room_data', '{}')
      .is('room_summary', null)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('backfill-room-summaries: failed to fetch rooms', error)
      throw error
    }

    const total = rooms?.length ?? 0
    console.log(`backfill-room-summaries: ${total} rooms to process`)

    if (total === 0) {
      return { total: 0, triggered: 0 }
    }

    // Batch trigger in chunks of 25 to avoid overwhelming the queue.
    const chunkSize = 25
    let triggered = 0

    for (let i = 0; i < rooms.length; i += chunkSize) {
      const chunk = rooms.slice(i, i + chunkSize)
      await generateRoomSummaryTask.batchTrigger(
        chunk.map((r) => ({ payload: { roomId: r.id } }))
      )
      triggered += chunk.length
      console.log(`backfill-room-summaries: triggered ${triggered}/${total}`)
    }

    return { total, triggered }
  },
})
