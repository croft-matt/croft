import { task } from '@trigger.dev/sdk/v3'
import { synthesiseRoom } from '@/lib/rooms/synthesise'

export interface SynthesiseRoomPayload {
  roomId: string
}

// Async room synthesis job. Enqueued after Tier 3 completes and after a job closes.
// Recalculates progress_total, progress_closed, and alert_text for the room.
// The resulting rooms table UPDATE fires the Realtime rooms channel, patching
// room cards in the cockpit and room detail in place.
export const synthesiseRoomTask = task({
  id: 'synthesise-room',
  maxDuration: 60,
  run: async (payload: SynthesiseRoomPayload) => {
    const { roomId } = payload
    await synthesiseRoom(roomId)
    return { roomId }
  },
})
