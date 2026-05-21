'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { sendEmail } from '@/lib/email/send'
import { tasks } from '@trigger.dev/sdk/v3'
import type { synthesiseRoomTask } from '@/trigger/jobs/synthesise-room'

export async function completeJob(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  const jobId = formData.get('jobId')
  const toRaw = formData.get('to')
  const bodyText = formData.get('bodyText')
  const assetFile = formData.get('asset')

  if (!jobId || typeof jobId !== 'string') return { success: false, error: 'Missing job ID.' }
  if (!toRaw || typeof toRaw !== 'string') return { success: false, error: 'Missing recipients.' }
  if (!bodyText || typeof bodyText !== 'string') return { success: false, error: 'Missing message body.' }

  let to: string[]
  try {
    to = JSON.parse(toRaw) as string[]
  } catch {
    return { success: false, error: 'Invalid recipients format.' }
  }

  if (!to.length) return { success: false, error: 'Add at least one recipient.' }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, workspace_id, email_id, description, status')
    .eq('id', jobId)
    .single()

  if (!job) return { success: false, error: 'Job not found.' }
  if (job.status !== 'open') return { success: false, error: 'Job is already closed.' }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, croft_email_address')
    .eq('id', job.workspace_id)
    .single()

  if (!workspace?.croft_email_address) {
    return { success: false, error: 'Workspace email address not configured.' }
  }

  const { data: sourceEmail } = await supabase
    .from('emails')
    .select('message_id, subject')
    .eq('id', job.email_id)
    .single()

  const subject = sourceEmail?.subject
    ? `Re: ${sourceEmail.subject}`
    : `Re: ${job.description}`

  // Upload asset to Supabase Storage if provided.
  let storagePath: string | null = null
  if (assetFile instanceof File && assetFile.size > 0) {
    const adminSupabase = createAdminClient()
    const ext = assetFile.name.split('.').pop() ?? 'bin'
    const path = `${job.workspace_id}/${jobId}/${Date.now()}.${ext}`
    const arrayBuffer = await assetFile.arrayBuffer()
    const { error: uploadError } = await adminSupabase.storage
      .from('assets')
      .upload(path, arrayBuffer, { contentType: assetFile.type })

    if (uploadError) {
      return { success: false, error: `Asset upload failed: ${uploadError.message}` }
    }
    storagePath = path

    // Record the asset in the assets table.
    await adminSupabase.from('assets').insert({
      workspace_id: job.workspace_id,
      email_id: job.email_id,
      filename: assetFile.name,
      storage_path: storagePath,
      mime_type: assetFile.type || null,
      size_bytes: assetFile.size,
      status: 'sent',
      status_updated_at: new Date().toISOString(),
    })
  }

  try {
    await sendEmail({
      workspaceId: job.workspace_id,
      to,
      subject,
      bodyText,
      ...(sourceEmail?.message_id
        ? { inReplyTo: sourceEmail.message_id, references: [sourceEmail.message_id] }
        : {}),
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email.',
    }
  }

  // Mark the job closed.
  const adminSupabase = createAdminClient()
  const { error: closeError } = await adminSupabase
    .from('jobs')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (closeError) {
    return { success: false, error: `Failed to close job: ${closeError.message}` }
  }

  // Enqueue room synthesis for all rooms the source email belongs to.
  // Non-fatal: synthesis failure must not prevent the job from being marked closed.
  const { data: roomEmails } = await adminSupabase
    .from('room_emails')
    .select('room_id')
    .eq('email_id', job.email_id)

  for (const re of roomEmails ?? []) {
    tasks.trigger<typeof synthesiseRoomTask>('synthesise-room', { roomId: re.room_id }).catch((err: unknown) => {
      console.error(`completeJob: synthesis trigger failed for room ${re.room_id}:`, err)
    })
  }

  return { success: true }
}
