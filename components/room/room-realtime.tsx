'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Room, Job, Asset, Contact, Email } from '@/lib/types/database'
import type { CrossReference } from '@/lib/queries/rooms'
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
  parent: { id: string; name: string } | null
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
  parent,
}: RoomRealtimeProps) {
  const [room, setRoom] = useState(initialRoom)
  const [jobs, setJobs] = useState(initialJobs)
  const [emails, setEmails] = useState(initialEmails)

  // Track email IDs in this room so we can filter incoming job events.
  const emailIdSet = useRef(new Set(initialEmails.map((e) => e.id)))

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

    // Channel 2: jobs — patch job status, update progress bar in place.
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
          // Only process jobs that belong to emails in this room.
          if (!emailIdSet.current.has(updated.email_id)) return

          setJobs((prev) => {
            const exists = prev.some((j) => j.id === updated.id)
            if (exists) return prev.map((j) => (j.id === updated.id ? updated : j))
            return [...prev, updated]
          })
        }
      )
      .subscribe()

    // Channel 3: room_emails INSERT — add new email IDs to our tracking set,
    // then fetch and prepend the email to the emails list.
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

          // Fetch the full email to prepend to the list.
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

    return () => {
      void supabase.removeChannel(roomChannel)
      void supabase.removeChannel(jobChannel)
      void supabase.removeChannel(roomEmailsChannel)
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
        overview={<OverviewTab room={room} childRooms={initialChildRooms} jobs={jobs} />}
        assets={<AssetsTab assets={initialAssets} />}
        contacts={<ContactsTab contacts={initialContacts} />}
        emails={<EmailsTab emails={emails} roomId={initialRoom.id} />}
      />
    </div>
  )
}
