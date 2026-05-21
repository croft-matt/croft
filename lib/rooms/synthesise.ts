import { createAdminClient } from '@/lib/supabase/admin'

// Recalculates progress counters and alert_text for a single room.
// Called after Tier 3 processing completes for an email filed to this room,
// and after a job is closed via the job modal.
// This write triggers the Supabase Realtime rooms channel, which patches
// the room card in the cockpit and room detail without a full page reload.
export async function synthesiseRoom(roomId: string): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Gather all email IDs filed to this room.
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)

  const emailIds = (roomEmails ?? []).map((re) => re.email_id)

  let progressTotal = 0
  let progressClosed = 0
  let alertText: string | null = null

  if (emailIds.length > 0) {
    const [{ count: total }, { count: closed }, { count: overdue }] = await Promise.all([
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('email_id', emailIds),
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('email_id', emailIds)
        .eq('status', 'closed'),
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .in('email_id', emailIds)
        .eq('status', 'open')
        .lt('due', now),
    ])

    progressTotal = total ?? 0
    progressClosed = closed ?? 0

    if (overdue && overdue > 0) {
      alertText = `${overdue} ${overdue === 1 ? 'job' : 'jobs'} overdue`
    }
  }

  await supabase
    .from('rooms')
    .update({
      progress_total: progressTotal,
      progress_closed: progressClosed,
      alert_text: alertText,
      alert_text_updated_at: alertText ? now : null,
      updated_at: now,
    })
    .eq('id', roomId)
}
