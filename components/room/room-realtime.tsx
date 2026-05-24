'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Room, Job, Asset, Contact, Email } from '@/lib/types/database'
import type { CrossReference } from '@/lib/queries/rooms'
import type { RoomBlockRow, RoomReadModel, RoomJob, Fact } from '@/lib/blocks/types'
import type { OpenLoop, OpenLoops } from '@/lib/jobs/open-loops'
import { resolveStack, resolveSuggestions } from '@/lib/blocks/registry'
import { RoomHeader } from '@/components/room/room-header'
import { CrossReferenceCards } from '@/components/room/cross-reference-cards'
import { OverdueAlert } from '@/components/room/overdue-alert'
import { RoomTabs } from '@/components/room/room-tabs'
import { OverviewTab } from '@/components/room/overview-tab'
import { AssetsTab } from '@/components/room/assets-tab'
import { ContactsTab } from '@/components/room/contacts-tab'
import { EmailsTab } from '@/components/room/emails-tab'

type ValidTab = 'overview' | 'assets' | 'contacts' | 'emails'

interface RoomRealtimeProps {
  workspaceId: string
  defaultTab: ValidTab
  initialRoom: Room
  initialChildRooms: Room[]
  initialJobs: Job[]
  initialAssets: Asset[]
  initialContacts: Contact[]
  initialEmails: Email[]
  initialCrossRefs: CrossReference[]
  initialRoomBlocks: RoomBlockRow[]
  initialConnectedAddresses: string[]
  parent: { id: string; name: string } | null
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
  const connectedSet = new Set(connectedAddresses)
  const now = new Date()

  const openLoops: OpenLoop[] = jobs
    .filter((j) => j.status === 'open')
    .map((job) => {
      const createdAt = new Date(job.created_at)
      const age_days = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      return { ...job, age_days, from_name: fromNameMap.get(job.email_id) ?? null }
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
      const sf = stored as { value: unknown; confidence?: number; kind?: string }
      if (typeof sf.value !== 'string') continue
      facts.push({
        category,
        key,
        value: sf.value,
        confidence: typeof sf.confidence === 'number' ? sf.confidence : 0,
        kind: typeof sf.kind === 'string' ? sf.kind : 'other',
      })
    }
  }
  return facts
}

export function RoomRealtimeProvider({
  workspaceId,
  defaultTab,
  initialRoom,
  initialChildRooms,
  initialJobs,
  initialAssets,
  initialContacts,
  initialEmails,
  initialCrossRefs,
  initialRoomBlocks,
  initialConnectedAddresses,
  parent,
}: RoomRealtimeProps) {
  const [room, setRoom] = useState(initialRoom)
  const [jobs, setJobs] = useState(initialJobs)
  const [emails, setEmails] = useState(initialEmails)
  const [roomBlocks, setRoomBlocks] = useState(initialRoomBlocks)

  // Track email IDs in this room so we can filter incoming job events.
  const emailIdSet = useRef(new Set(initialEmails.map((e) => e.id)))

  // Derive the read model reactively from live state. When room_data, jobs,
  // emails, or roomBlocks change, useMemo recomputes the affected values.
  const readModel = useMemo((): RoomReadModel => {
    const roomData = (room.room_data ?? {}) as Record<string, unknown>
    const fromNameMap = new Map(emails.map((e) => [e.id, e.from_name ?? null]))
    const openLoops = buildOpenLoopsLocal(jobs, emails, initialConnectedAddresses)
    const facts = flattenFacts(roomData)

    const roomJobs: RoomJob[] = jobs
      .filter((j) => j.status !== 'cancelled')
      .map((j) => ({
        id: j.id,
        intent: j.intent as RoomJob['intent'],
        description: j.description,
        owner: j.owner,
        due: j.due,
        status: j.status as RoomJob['status'],
        closed_at: j.closed_at,
        closed_by_email_id: j.closed_by_email_id,
        parent_job_id: j.parent_job_id,
        email_id: j.email_id,
        from_name: fromNameMap.get(j.email_id) ?? null,
        created_at: j.created_at,
      }))

    return {
      workspaceId,
      roomId: initialRoom.id,
      openLoops,
      roomData,
      facts,
      assets: initialAssets,
      contacts: initialContacts,
      jobs: roomJobs,
      connectedAddresses: initialConnectedAddresses,
    }
  }, [room.room_data, jobs, emails, initialConnectedAddresses, workspaceId, initialRoom.id, initialAssets, initialContacts])

  const stack = useMemo(() => resolveStack(readModel, roomBlocks), [readModel, roomBlocks])
  const suggestions = useMemo(() => resolveSuggestions(readModel, roomBlocks), [readModel, roomBlocks])

  useEffect(() => {
    const supabase = createClient()
    const roomId = initialRoom.id

    // Channel 1: rooms — patch room_data, progress counters, alert_text.
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
          }))
        }
      )
      .subscribe()

    // Channel 2: jobs — patch job status, update derived state.
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
        }
      )
      .subscribe()

    // Channel 3: room_emails INSERT — add new email IDs and prepend the email.
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
        }
      )
      .subscribe()

    // Channel 4: room_blocks — accept/dismiss decisions update the stack and
    // suggestions rail live, including changes from other devices/tabs.
    const roomBlocksChannel = supabase
      .channel(`room:${roomId}:room_blocks`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_blocks',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as RoomBlockRow
          setRoomBlocks((prev) => {
            const exists = prev.some((r) => r.id === updated.id)
            if (exists) return prev.map((r) => (r.id === updated.id ? updated : r))
            return [...prev, updated]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(roomChannel)
      void supabase.removeChannel(jobChannel)
      void supabase.removeChannel(roomEmailsChannel)
      void supabase.removeChannel(roomBlocksChannel)
    }
  }, [initialRoom.id, workspaceId])

  const overdueJobs = jobs.filter(
    (j) => j.status === 'open' && j.due && new Date(j.due) < new Date()
  )
  const hasOverdue = overdueJobs.length > 0

  return (
    <div className="flex flex-col min-h-full">
      <RoomHeader
        room={room}
        parent={parent}
        jobs={jobs}
        childRooms={initialChildRooms}
      />

      <CrossReferenceCards crossRefs={initialCrossRefs} />

      {hasOverdue && room.alert_text && (
        <OverdueAlert alertText={room.alert_text} />
      )}

      <RoomTabs
        defaultTab={defaultTab}
        overview={
          <OverviewTab
            roomId={initialRoom.id}
            roomData={(room.room_data ?? {}) as Record<string, unknown>}
            childRooms={initialChildRooms}
            stack={stack}
            suggestions={suggestions}
          />
        }
        assets={<AssetsTab assets={initialAssets} />}
        contacts={<ContactsTab contacts={initialContacts} />}
        emails={<EmailsTab emails={emails} roomId={initialRoom.id} />}
      />
    </div>
  )
}
