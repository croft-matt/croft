import { createClient } from '@/lib/supabase/server'
import type { Email, Job } from '@/lib/types/database'

// ─── Waiting on you ───────────────────────────────────────────────────────────
// Emails where the AI flagged requires_response = true, sorted by response_by
// deadline ascending (most urgent deadline first), nulls last.

export interface WaitingEmail {
  id: string
  fromName: string | null
  fromAddress: string
  subjectSummary: string | null
  receivedAt: string
  responseBy: string | null
  roomId: string | null
  roomName: string | null
}

export async function getWaitingEmails(workspaceId: string): Promise<WaitingEmail[]> {
  const supabase = await createClient()

  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, subject_summary, received_at, response_by')
    .eq('workspace_id', workspaceId)
    .eq('requires_response', true)
    .eq('processing_state', 'processed')
    .order('response_by', { ascending: true, nullsFirst: false })
    .limit(20)

  if (!emails || emails.length === 0) return []

  const emailIds = emails.map((e) => e.id)
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  return emails.map((e) => ({
    id: e.id,
    fromName: e.from_name,
    fromAddress: e.from_address,
    subjectSummary: e.subject_summary,
    receivedAt: e.received_at,
    responseBy: e.response_by,
    roomId: roomByEmail[e.id]?.roomId ?? null,
    roomName: roomByEmail[e.id]?.roomName ?? null,
  }))
}

// ─── Overdue jobs ─────────────────────────────────────────────────────────────
// Open jobs past their due date, sorted by most overdue first.

export interface OverdueJob {
  id: string
  description: string
  due: string
  emailId: string
  fromName: string | null
  roomId: string | null
  roomName: string | null
}

export async function getOverdueJobs(workspaceId: string): Promise<OverdueJob[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, description, due, email_id, emails!email_id(from_name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lt('due', now)
    .order('due', { ascending: true })
    .limit(20)

  if (!jobs || jobs.length === 0) return []

  const emailIds = [...new Set(jobs.map((j) => j.email_id))]
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  return jobs.map((j) => ({
    id: j.id,
    description: j.description,
    due: j.due!,
    emailId: j.email_id,
    fromName: (j.emails as { from_name: string | null } | null)?.from_name ?? null,
    roomId: roomByEmail[j.email_id]?.roomId ?? null,
    roomName: roomByEmail[j.email_id]?.roomName ?? null,
  }))
}

// ─── Hot emails ───────────────────────────────────────────────────────────────
// High urgency-score emails from the last 48h. Shows urgency_reason as
// the key signal rather than the raw subject line.

export interface HotEmail {
  id: string
  fromName: string | null
  fromAddress: string
  urgencyScore: number
  urgencyReason: string | null
  subjectSummary: string | null
  receivedAt: string
  roomId: string | null
  roomName: string | null
}

export async function getHotEmails(workspaceId: string): Promise<HotEmail[]> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: emails } = await supabase
    .from('emails')
    .select('id, from_name, from_address, urgency_score, urgency_reason, subject_summary, received_at')
    .eq('workspace_id', workspaceId)
    .gte('urgency_score', 7)
    .eq('processing_state', 'processed')
    .gte('received_at', cutoff)
    .order('urgency_score', { ascending: false })
    .order('received_at', { ascending: false })
    .limit(20)

  if (!emails || emails.length === 0) return []

  const emailIds = emails.map((e) => e.id)
  const { data: roomEmails } = await supabase
    .from('room_emails')
    .select('email_id, room_id, rooms(id, name)')
    .in('email_id', emailIds)

  const roomByEmail: Record<string, { roomId: string; roomName: string }> = {}
  for (const re of roomEmails ?? []) {
    if (!roomByEmail[re.email_id]) {
      const room = re.rooms as { id: string; name: string } | null
      if (room) roomByEmail[re.email_id] = { roomId: room.id, roomName: room.name }
    }
  }

  return emails.map((e) => ({
    id: e.id,
    fromName: e.from_name,
    fromAddress: e.from_address,
    urgencyScore: e.urgency_score ?? 7,
    urgencyReason: e.urgency_reason,
    subjectSummary: e.subject_summary,
    receivedAt: e.received_at,
    roomId: roomByEmail[e.id]?.roomId ?? null,
    roomName: roomByEmail[e.id]?.roomName ?? null,
  }))
}
