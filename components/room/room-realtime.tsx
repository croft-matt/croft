'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Room, Job, Contact, Email } from '@/lib/types/database'
import type { CrossReference } from '@/lib/queries/rooms'
import type { RoomAssets } from '@/lib/rooms/assets'
import type { RoomPeople } from '@/lib/rooms/people'
import type { RoomReadModel, RoomJob, Fact } from '@/lib/blocks/types'
import type { OpenLoop, OpenLoops, OwnerGroup } from '@/lib/jobs/open-loops'
import { RoomShell } from '@/components/room/room-shell'

interface RoomRealtimeProps {
  workspaceId: string
  initialRoom: Room
  initialChildRooms: Room[]
  initialJobs: Job[]
  initialRoomAssets: RoomAssets
  initialRoomPeople: RoomPeople
  initialContacts: Contact[]
  initialEmails: Email[]
  initialCrossRefs: CrossReference[]
  initialConnectedAddresses: string[]
  initialTheirCourtByPerson: OwnerGroup[]
  parent: Pick<Room, 'id' | 'name'> | null
  initialAllRooms: Array<{ id: string; name: string; parent_room_id: string | null }>
}

// Pure helper: builds OpenLoops from already-fetched data.
// Inlined here so this client component has no runtime dependency on
// lib/jobs/open-loops.ts (which imports createClient from next/headers context).
function buildOpenLoopsLocal(
  jobs: Job[],
  emails: Email[],
  connectedAddresses: string[],
): OpenLoops {
  const fromNameMap = new Map(emails.map((e) => [e.id, e.from_name ?? null]))
  const fromAddressMap = new Map(emails.map((e) => [e.id, e.from_address ?? null]))
  const connectedSet = new Set(connectedAddresses)
  const now = new Date()

  const openLoops: OpenLoop[] = jobs
    .filter((j) => j.status === 'open')
    .map((job) => {
      const createdAt = new Date(job.created_at)
      const age_days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      const senderAddress = fromAddressMap.get(job.email_id)?.toLowerCase()
      const isSelf = senderAddress ? connectedSet.has(senderAddress) : false
      return {
        ...job,
        age_days,
        from_name: isSelf ? null : (fromNameMap.get(job.email_id) ?? null),
        source: (job.source === 'anticipated' ? 'anticipated' : 'extracted') as 'extracted' | 'anticipated',
      }
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return {
    yourCourt: openLoops.filter((l) => l.owner != null && connectedSet.has(l.owner)),
    theirCourt: openLoops.filter((l) => l.owner == null || !connectedSet.has(l.owner)),
  }
}

// Pure helper: flattens room_data JSONB into a typed Fact array.
function flattenFacts(roomData: Record<string, unknown>): Fact[] {
  const facts: Fact[] = []
  for (const [category, keys] of Object.entries(roomData)) {
    if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    for (const [key, stored] of Object.entries(keys as Record<string, unknown>)) {
      if (typeof stored !== 'object' || stored === null || !('value' in (stored as object))) continue
      const sf = stored as { value: unknown; confidence?: number; kind?: string; email_id?: string }
      if (typeof sf.value !== 'string') continue
      facts.push({
        category,
        key,
        value: sf.value,
        confidence: typeof sf.confidence === 'number' ? sf.confidence : 0,
        kind: typeof sf.kind === 'string' ? sf.kind : 'other',
        email_id: typeof sf.email_id === 'string' ? sf.email_id : null,
      })
    }
  }
  return facts
}

export function RoomRealtimeProvider({
  workspaceId,
  initialRoom,
  initialChildRooms,
  initialJobs,
  initialRoomAssets,
  initialRoomPeople,
  initialContacts,
  initialEmails,
  initialCrossRefs,
  initialConnectedAddresses,
  initialTheirCourtByPerson,
  parent,
  initialAllRooms,
}: RoomRealtimeProps) {
  const [room, setRoom] = useState(initialRoom)
  const [jobs, setJobs] = useState(initialJobs)
  const [emails, setEmails] = useState(initialEmails)

  const emailIdSet = useRef(new Set(initialEmails.map((e) => e.id)))

  const readModel = useMemo((): RoomReadModel => {
    const roomData = (room.room_data ?? {}) as Record<string, unknown>
    const fromNameMap = new Map(emails.map((e) => [e.id, e.from_name ?? null]))
    const fromAddressMap = new Map(emails.map((e) => [e.id, e.from_address ?? null]))
    const connectedSet = new Set(initialConnectedAddresses)
    const openLoops = buildOpenLoopsLocal(jobs, emails, initialConnectedAddresses)
    const facts = flattenFacts(roomData)

    const roomJobs: RoomJob[] = jobs
      .filter((j) => j.status !== 'cancelled')
      .map((j) => {
        const senderAddress = fromAddressMap.get(j.email_id)?.toLowerCase()
        const isSelf = senderAddress ? connectedSet.has(senderAddress) : false
        return {
          id: j.id,
          intent: j.intent as RoomJob['intent'],
          description: j.description,
          owner: j.owner,
          due: j.due,
          status: j.status as RoomJob['status'],
          closed_at: j.closed_at,
          closed_by_email_id: j.closed_by_email_id,
          closed_by_from_name: j.closed_by_email_id ? (fromNameMap.get(j.closed_by_email_id) ?? null) : null,
          parent_job_id: j.parent_job_id,
          email_id: j.email_id,
          from_name: isSelf ? null : (fromNameMap.get(j.email_id) ?? null),
          created_at: j.created_at,
        }
      })

    return {
      workspaceId,
      roomId: initialRoom.id,
      openLoops,
      roomData,
      facts,
      assets: initialRoomAssets.flat,
      contacts: initialContacts,
      jobs: roomJobs,
      connectedAddresses: initialConnectedAddresses,
    }
  }, [room.room_data, jobs, emails, initialConnectedAddresses, workspaceId, initialRoom.id, initialRoomAssets.flat, initialContacts])

  useEffect(() => {
    const supabase = createClient()
    const roomId = initialRoom.id

    // Channel 1: rooms -- patch room_data, progress counters, alert_text, room_summary.
    const roomChannel = supabase
      .channel(`room:${roomId}:rooms`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as Room
          setRoom((prev) => ({
            ...prev,
            progress_total: updated.progress_total,
            progress_closed: updated.progress_closed,
            room_data: updated.room_data,
            alert_text: updated.alert_text,
            alert_text_updated_at: updated.alert_text_updated_at,
            room_summary: updated.room_summary,
            room_summary_updated_at: updated.room_summary_updated_at,
            room_status: updated.room_status,
            room_status_updated_at: updated.room_status_updated_at,
          }))
        },
      )
      .subscribe()

    // Channel 2: jobs -- patch job status, update derived state.
    const jobChannel = supabase
      .channel(`room:${roomId}:jobs`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const updated = payload.new as Job
          if (!emailIdSet.current.has(updated.email_id)) return

          setJobs((prev) => {
            const exists = prev.some((j) => j.id === updated.id)
            if (exists) return prev.map((j) => (j.id === updated.id ? updated : j))
            return [...prev, updated]
          })
        },
      )
      .subscribe()

    // Channel 3: room_emails INSERT -- add new email IDs and prepend the email.
    const roomEmailsChannel = supabase
      .channel(`room:${roomId}:room_emails`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_emails',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new as { email_id: string }
          if (emailIdSet.current.has(row.email_id)) return

          emailIdSet.current.add(row.email_id)

          const { data } = await supabase
            .from('emails')
            .select('*')
            .eq('id', row.email_id)
            .single()

          if (data) {
            setEmails((prev) => [data as Email, ...prev])
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(roomChannel)
      void supabase.removeChannel(jobChannel)
      void supabase.removeChannel(roomEmailsChannel)
    }
  }, [initialRoom.id, workspaceId])

  return (
    <RoomShell
      room={room}
      readModel={readModel}
      jobs={jobs}
      childRooms={initialChildRooms}
      crossRefs={initialCrossRefs}
      ownerGroups={initialTheirCourtByPerson}
      parent={parent}
      roomAssets={initialRoomAssets}
      roomPeople={initialRoomPeople}
      allRooms={initialAllRooms}
      workspaceId={workspaceId}
    />
  )
}
