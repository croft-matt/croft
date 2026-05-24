import { createAdminClient } from '@/lib/supabase/admin'
import type { Extraction } from '@/lib/types/database'
import type { Json } from '@/lib/types/database'

// Stored shape for a single fact value inside room_data.
// prior holds superseded values newest last, kept for drift display.
interface StoredFact {
  value: string
  confidence: number
  updated_at: string
  kind?: string
  prior?: Array<{ value: string; at: string }>
}

// Merges extracted facts into the existing room_data object.
// room_data is keyed by category, then by snake_case key.
//
// Merge rules per incoming fact:
// - new key: write it.
// - relation correction: overwrite regardless of confidence; push old value
//   onto prior. Recency wins over confidence.
// - relation restatement with same value: refresh updated_at only.
// - relation new but key already holds a different value: silent correction.
//   Prefer newer value and push previous onto prior.
// - confidence is only a tiebreaker for same-extraction conflicts.
function mergeFacts(
  existing: Record<string, unknown>,
  facts: Extraction['facts'],
): Record<string, unknown> {
  const now = new Date().toISOString()
  const merged: Record<string, Record<string, StoredFact>> = {}

  // Copy existing structure into a typed working object.
  for (const [cat, keys] of Object.entries(existing)) {
    if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
      merged[cat] = { ...(keys as Record<string, StoredFact>) }
    }
  }

  for (const fact of facts) {
    const { category, key, value, confidence, relation, kind } = fact

    if (!merged[category]) {
      merged[category] = {}
    }

    const current = merged[category][key]

    if (!current) {
      // First time seeing this fact.
      merged[category][key] = { value, confidence, updated_at: now, kind }
      continue
    }

    if (relation === 'restatement' && current.value === value) {
      // Same value restated: refresh timestamp, keep everything else.
      merged[category][key] = { ...current, updated_at: now }
      continue
    }

    if (relation === 'correction' || current.value !== value) {
      // Correction or implicit change: recency wins regardless of confidence.
      const prior = current.prior ? [...current.prior] : []
      prior.push({ value: current.value, at: current.updated_at ?? now })
      merged[category][key] = { value, confidence, updated_at: now, kind, prior }
      continue
    }

    // relation new, same value already stored: just refresh timestamp.
    merged[category][key] = { ...current, updated_at: now }
  }

  return merged as Record<string, unknown>
}

// Recalculates progress counters and alert_text for a single room.
// Called after Tier 3 processing completes for an email filed to this room,
// and after a job is closed via the job modal.
// This write triggers the Supabase Realtime rooms channel, which patches
// the room card in the cockpit and room detail without a full page reload.
//
// When emailId is provided, facts from that email's extraction are merged
// into room_data. When not provided (job close path), only progress
// counters are recalculated -- there is no new email to read facts from.
export async function synthesiseRoom(roomId: string, emailId?: string): Promise<void> {
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
    // Fetch the workspace's connected account address so overdue counts only
    // jobs the user themselves is responsible for, not supplier-owned work.
    const { data: room } = await supabase
      .from('rooms')
      .select('workspace_id')
      .eq('id', roomId)
      .single()

    let connectedAddress: string | null = null
    if (room?.workspace_id) {
      const { data: account } = await supabase
        .from('email_accounts')
        .select('email_address')
        .eq('workspace_id', room.workspace_id)
        .limit(1)
        .maybeSingle()
      connectedAddress = account?.email_address ?? null
    }

    let overdueQuery = supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .in('email_id', emailIds)
      .eq('status', 'open')
      .lt('due', now)

    if (connectedAddress) {
      overdueQuery = overdueQuery.eq('owner', connectedAddress)
    }

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
      overdueQuery,
    ])

    progressTotal = total ?? 0
    progressClosed = closed ?? 0

    if (overdue && overdue > 0) {
      alertText = `${overdue} ${overdue === 1 ? 'job' : 'jobs'} overdue`
    }
  }

  // Merge facts when triggered by a new email being processed.
  let roomData: Record<string, unknown> | undefined

  if (emailId) {
    const [{ data: email }, { data: room }] = await Promise.all([
      supabase.from('emails').select('extraction').eq('id', emailId).single(),
      supabase.from('rooms').select('room_data').eq('id', roomId).single(),
    ])

    const facts = (email?.extraction as Extraction | null)?.facts ?? []
    const existingData = (room?.room_data ?? {}) as Record<string, unknown>

    if (facts.length > 0) {
      roomData = mergeFacts(existingData, facts)
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
      ...(roomData !== undefined ? { room_data: roomData as unknown as Json } : {}),
    })
    .eq('id', roomId)
}
