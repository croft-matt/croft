'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EmailRow } from '@/components/email/email-row'
import type { AllEmailsRow } from '@/lib/queries/all-emails'

interface AllEmailsRealtimeProps {
  workspaceId: string
  initialEmails: AllEmailsRow[]
}

export function AllEmailsRealtime({ workspaceId, initialEmails }: AllEmailsRealtimeProps) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`all-emails:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emails',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, router])

  if (initialEmails.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>
  }

  return (
    <div className="space-y-2">
      {initialEmails.map((email) => (
        <EmailRow key={email.id} email={email} />
      ))}
    </div>
  )
}
