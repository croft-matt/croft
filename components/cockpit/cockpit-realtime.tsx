'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Email, Job, Room } from '@/lib/types/database'
import type { OverdueJobRow, RoomCardRow } from '@/lib/queries/cockpit'
import { TopBar } from '@/components/cockpit/top-bar'
import { UrgentList } from '@/components/cockpit/urgent-list'
import { OverdueList } from '@/components/cockpit/overdue-list'
import { RoomCard } from '@/components/cockpit/room-card'

interface CockpitRealtimeProps {
  workspaceId: string
  workspaceName: string
  initialUrgentEmails: Email[]
  initialRoomNames: Record<string, string>
  initialOverdueJobs: OverdueJobRow[]
  initialRooms: RoomCardRow[]
  initialProcessing: number
  initialFailed: number
}

const PROCESSING_STATES = new Set(['received', 'urgency_scanned', 'queued', 'processing'])

export function CockpitRealtimeProvider({
  workspaceId,
  workspaceName,
  initialUrgentEmails,
  initialRoomNames,
  initialOverdueJobs,
  initialRooms,
  initialProcessing,
  initialFailed,
}: CockpitRealtimeProps) {
  const [urgentEmails, setUrgentEmails] = useState(initialUrgentEmails)
  const [roomNames] = useState(initialRoomNames)
  const [overdueJobs, setOverdueJobs] = useState(initialOverdueJobs)
  const [rooms, setRooms] = useState(initialRooms)
  const [processing, setProcessing] = useState(initialProcessing)
  const [failed, setFailed] = useState(initialFailed)

  useEffect(() => {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // Channel 1: emails — urgent prepend + processing count updates.
    const emailChannel = supabase
      .channel(`workspace:${workspaceId}:emails`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emails',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const email = payload.new as Email
          if (!email?.id) return

          if (payload.eventType === 'INSERT') {
            if (PROCESSING_STATES.has(email.processing_state)) {
              setProcessing((p) => p + 1)
            }
          }

          if (payload.eventType === 'UPDATE') {
            const prev = payload.old as Partial<Email>
            const wasProcessing = prev.processing_state
              ? PROCESSING_STATES.has(prev.processing_state)
              : false
            const isNowProcessing = PROCESSING_STATES.has(email.processing_state)

            if (wasProcessing && !isNowProcessing) {
              setProcessing((p) => Math.max(0, p - 1))
            }
            if (email.processing_state === 'failed' && prev.processing_state !== 'failed') {
              setFailed((f) => f + 1)
            }
          }

          // Prepend to urgent list if score qualifies.
          if (
            (email.urgency_score ?? 0) >= 7 &&
            email.processing_state === 'processed' &&
            email.received_at >= cutoff
          ) {
            setUrgentEmails((prev) => {
              const exists = prev.some((e) => e.id === email.id)
              if (exists) {
                return prev.map((e) => (e.id === email.id ? email : e))
              }
              return [email, ...prev].slice(0, 8)
            })
          }
        }
      )
      .subscribe()

    // Channel 2: jobs — remove closed jobs from overdue list.
    const jobChannel = supabase
      .channel(`workspace:${workspaceId}:jobs`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const job = payload.new as Job
          if (job.status === 'closed') {
            setOverdueJobs((prev) => prev.filter((j) => j.id !== job.id))
          }
        }
      )
      .subscribe()

    // Channel 3: rooms — patch progress bar and room_data in place.
    const roomChannel = supabase
      .channel(`workspace:${workspaceId}:rooms`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const updated = payload.new as Room
          setRooms((prev) =>
            prev.map((r) =>
              r.id === updated.id
                ? {
                    ...r,
                    progress_total: updated.progress_total,
                    progress_closed: updated.progress_closed,
                    room_data: updated.room_data,
                    // Recompute has_overdue: if progress matches, no overdue by definition.
                    has_overdue:
                      updated.progress_closed < updated.progress_total
                        ? r.has_overdue
                        : false,
                  }
                : r
            )
          )
        }
      )
      .subscribe()

    // 60-second interval: remove jobs from overdue list whose due date was just cleared,
    // and mark them in the overdue list if they were recently due (client-side clock drift guard).
    const interval = setInterval(() => {
      const now = new Date().toISOString()
      setOverdueJobs((prev) =>
        prev.filter((j) => !j.due || j.due < now)
      )
    }, 60_000)

    return () => {
      void supabase.removeChannel(emailChannel)
      void supabase.removeChannel(jobChannel)
      void supabase.removeChannel(roomChannel)
      clearInterval(interval)
    }
  }, [workspaceId])

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        workspaceName={workspaceName}
        processing={processing}
        failed={failed}
      />

      <div className="flex flex-1 gap-6 p-6">
        {/* Left column: urgent + overdue */}
        <div className="w-[42%] shrink-0 space-y-6">
          <div>
            <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Urgent
            </p>
            <UrgentList emails={urgentEmails} roomNames={roomNames} />
          </div>
          <OverdueList jobs={overdueJobs} />
        </div>

        {/* Right column: rooms */}
        <div className="flex-1 min-w-0">
          <p className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rooms
          </p>
          {rooms.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-5">
              <p className="text-sm text-muted-foreground">
                No rooms yet. Rooms are created when emails arrive or you create one manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
