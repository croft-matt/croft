'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { generateReplySuggestion } from '@/lib/ai/reply-suggestion'
import { getWorkspaceAssetsGrouped } from '@/lib/queries/assets'
import { getWorkspaceId } from '@/lib/auth/helpers'
import type { AssetGroup } from '@/lib/queries/assets'
import type { Job } from '@/lib/types/database'

export async function sendReply(params: {
  roomId: string
  emailId: string
  to: string[]
  cc?: string[]
  body: string
  selectedAssetIds: string[]
  closingJobIds?: string[]
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated.' }

  const { data: sourceEmail } = await supabase
    .from('emails')
    .select('message_id, subject, thread_id')
    .eq('id', params.emailId)
    .single()

  if (!sourceEmail) return { success: false, error: 'Email not found.' }

  const { data: room } = await supabase
    .from('rooms')
    .select('workspace_id')
    .eq('id', params.roomId)
    .single()

  if (!room) return { success: false, error: 'Room not found.' }

  const subject = sourceEmail.subject
    ? `Re: ${sourceEmail.subject.startsWith('Re: ') ? sourceEmail.subject.slice(4) : sourceEmail.subject}`
    : 'Re: (no subject)'

  // Fetch and buffer selected asset files from Storage, server-side only.
  const attachments: Array<{ filename: string; content: Buffer }> = []

  if (params.selectedAssetIds.length > 0) {
    const adminSupabase = createAdminClient()
    const { data: selectedAssets } = await adminSupabase
      .from('assets')
      .select('id, filename, storage_path')
      .in('id', params.selectedAssetIds)
      .eq('workspace_id', room.workspace_id)

    for (const asset of selectedAssets ?? []) {
      if (!asset.storage_path) continue
      const { data: file } = await adminSupabase.storage.from('assets').download(asset.storage_path)
      if (file) {
        attachments.push({
          filename: asset.filename,
          content: Buffer.from(await file.arrayBuffer()),
        })
      }
    }
  }

  let sentResendId: string | null = null

  try {
    const result = await sendEmail({
      workspaceId: room.workspace_id,
      to: params.to,
      cc: params.cc?.length ? params.cc : undefined,
      subject,
      bodyText: params.body,
      inReplyTo: sourceEmail.message_id ?? undefined,
      references: sourceEmail.message_id ? [sourceEmail.message_id] : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      roomId: params.roomId,
      threadId: sourceEmail.thread_id ?? undefined,
      source: 'user_reply',
      attachedAssetIds:
        params.selectedAssetIds.length > 0 ? params.selectedAssetIds : undefined,
    })
    sentResendId = result.messageId
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send.',
    }
  }

  // Close attached jobs atomically after a successful send.
  // Jobs are never closed if sendEmail throws -- the try/catch above prevents reaching here.
  if (params.closingJobIds?.length && sentResendId) {
    const adminSupabase = createAdminClient()

    // Find the DB row for the sent email by its Resend ID.
    const { data: sentEmailRow } = await adminSupabase
      .from('emails')
      .select('id')
      .eq('resend_email_id', sentResendId)
      .single()

    const sentEmailId = sentEmailRow?.id ?? null

    await adminSupabase
      .from('jobs')
      .update({
        status: 'closed',
        closed_by_email_id: sentEmailId,
        updated_at: new Date().toISOString(),
      })
      .in('id', params.closingJobIds)
      .eq('workspace_id', room.workspace_id)
      .eq('status', 'open')
  }

  return { success: true }
}

export async function getReplysuggestion(
  emailId: string,
  roomId: string,
): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ''

  // Do not generate suggestions for the user's own sent emails.
  // Replying to a sent email would be replying to yourself.
  const { data: email } = await supabase
    .from('emails')
    .select('source')
    .eq('id', emailId)
    .single()

  if (email?.source === 'user_sent') return ''

  return generateReplySuggestion({ emailId, roomId })
}

export async function fetchWorkspaceAssetsForCompose(): Promise<AssetGroup[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) return []
  return getWorkspaceAssetsGrouped(membership.workspace_id)
}

// Returns open jobs from the same thread and workspace as the given email,
// excluding any job IDs in excludeJobIds. Used to populate the job picker in compose.
export async function fetchOpenJobsForThread(
  emailId: string,
  excludeJobIds: string[],
): Promise<Job[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  // Get the thread_id for this email.
  const { data: emailRow } = await supabase
    .from('emails')
    .select('thread_id')
    .eq('id', emailId)
    .single()

  if (!emailRow?.thread_id) return []

  // Find all email IDs in this workspace with the same thread_id.
  const { data: threadEmails } = await supabase
    .from('emails')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('thread_id', emailRow.thread_id)

  const threadEmailIds = (threadEmails ?? []).map((e) => e.id)
  if (threadEmailIds.length === 0) return []

  // Fetch open jobs from those emails.
  let query = supabase
    .from('jobs')
    .select('*')
    .in('email_id', threadEmailIds)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (excludeJobIds.length > 0) {
    query = query.not('id', 'in', `(${excludeJobIds.join(',')})`)
  }

  const { data: jobs } = await query
  return (jobs ?? []) as Job[]
}

// ---------------------------------------------------------------------------
// Person response surface
// ---------------------------------------------------------------------------

export type PersonResponseJob = Job & {
  sourceSubject: string | null
  sourceReceivedAt: string
}

export async function fetchPersonResponseJobs(
  roomId: string,
  personAddress: string,
): Promise<PersonResponseJob[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  // Email IDs in this room.
  const { data: roomEmailRows } = await supabase
    .from('room_emails')
    .select('email_id')
    .eq('room_id', roomId)

  const roomEmailIds = (roomEmailRows ?? []).map((r) => r.email_id)
  if (roomEmailIds.length === 0) return []

  // Emails in this room sent by this person (case-insensitive).
  const { data: fromEmails } = await supabase
    .from('emails')
    .select('id, subject, received_at')
    .in('id', roomEmailIds)
    .ilike('from_address', personAddress)
    .order('received_at', { ascending: false })

  const fromEmailIds = (fromEmails ?? []).map((e) => e.id)
  if (fromEmailIds.length === 0) return []

  // Connected addresses -- scope to your-court jobs only.
  const { data: accountRows } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  const connectedAddresses = (accountRows ?? []).map((r) => r.email_address.toLowerCase())

  // Open jobs from those emails, owned by a connected address.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('*')
    .in('email_id', fromEmailIds)
    .eq('status', 'open')
    .in('owner', connectedAddresses)
    .order('created_at', { ascending: true })

  const emailMetaMap = new Map(
    (fromEmails ?? []).map((e) => [e.id, { subject: e.subject, receivedAt: e.received_at }]),
  )

  return ((jobRows ?? []) as Job[]).map((job) => {
    const meta = emailMetaMap.get(job.email_id)
    return {
      ...job,
      sourceSubject: meta?.subject ?? null,
      sourceReceivedAt: meta?.receivedAt ?? job.created_at,
    }
  })
}

export async function markJobsDone(
  jobIds: string[],
): Promise<{ success: boolean; error?: string }> {
  if (jobIds.length === 0) return { success: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated.' }

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No workspace.' }

  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'closed',
      closed_by_email_id: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', jobIds)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// Returns the connected email addresses for the current workspace.
// Used by PersonResponsePanel to derive the sender's first name for the sign-off.
export async function fetchConnectedAddresses(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  const { data } = await supabase
    .from('email_accounts')
    .select('email_address')
    .eq('workspace_id', workspaceId)

  return (data ?? []).map((r) => r.email_address)
}
