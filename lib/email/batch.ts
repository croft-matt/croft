import { createAdminClient } from '@/lib/supabase/admin'
import { runFullClassification } from '@/lib/ai/tier3'
import { tasks } from '@trigger.dev/sdk/v3'
import type { embedTask } from '@/trigger/jobs/embed'
import type { synthesiseRoomTask } from '@/trigger/jobs/synthesise-room'
import type { Extraction } from '@/lib/types/database'

// Processes a single queued email through Tier 3.
// Used by both the batch scheduled job and the on-demand job.
// Sequential processing is intentional: each call reuses the cached Tier 3 system prompt.
// Do not parallelise within a workspace.
export async function classifyEmail(emailId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('emails')
    .update({ processing_state: 'processing' })
    .eq('id', emailId)

  try {
    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`classify: email ${emailId} not found`)

    const result = await runFullClassification(email)

    await supabase
      .from('emails')
      .update({
        processing_state: 'processed',
        subject_summary: result.subject_summary,
        extraction: result.extraction,
        extraction_complete: result.extraction_complete,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)

    // Write structured intelligence derived from the extraction.
    // These writes are non-fatal: failure here does not mark the email as failed.
    // The email processed successfully. Write errors are logged and retried separately.
    const { matchedRoomIds } = await writeExtractionResults(emailId, email.workspace_id, result.extraction)

    // Enqueue room synthesis for each room the email was filed into.
    // Non-fatal: a synthesis failure must not affect the email's processing state.
    for (const roomId of matchedRoomIds) {
      tasks.trigger<typeof synthesiseRoomTask>('synthesise-room', { roomId }).catch((err: unknown) => {
        console.error(`classifyEmail: synthesis trigger failed for room ${roomId}:`, err)
      })
    }

    // Enqueue embedding generation as a separate low-priority job.
    // Never block Tier 3 completion on this.
    await tasks.trigger<typeof embedTask>('generate-embedding', { emailId })
  } catch (err) {
    await supabase
      .from('emails')
      .update({ processing_state: 'failed' })
      .eq('id', emailId)

    throw err
  }
}

async function writeExtractionResults(
  emailId: string,
  workspaceId: string,
  extraction: Extraction,
): Promise<{ matchedRoomIds: string[] }> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 1. Insert jobs.
  if ((extraction.jobs ?? []).length > 0) {
    const jobRows = (extraction.jobs ?? []).map((j) => ({
      workspace_id: workspaceId,
      email_id: emailId,
      intent: j.intent,
      description: j.description,
      owner: j.owner ?? null,
      due: j.due ?? null,
      confidence: j.confidence,
      status: 'open' as const,
    }))

    const { error } = await supabase.from('jobs').insert(jobRows)
    if (error) {
      console.error(`writeExtractionResults: jobs insert failed for ${emailId}:`, error.message)
    }
  }

  // 2. Upsert contacts.
  // on conflict: update last_seen_at always; fill null fields only, never overwrite existing values.
  for (const c of extraction.entities?.contacts ?? []) {
    if (!c.email) continue

    const { error } = await supabase.from('contacts').upsert(
      {
        workspace_id: workspaceId,
        email_address: c.email,
        name: c.name || null,
        role: c.role || null,
        last_seen_at: now,
      },
      {
        onConflict: 'workspace_id,email_address',
        ignoreDuplicates: false,
      },
    )

    if (error) {
      console.error(
        `writeExtractionResults: contact upsert failed for ${c.email}:`,
        error.message,
      )
    }
  }

  // 3. Room auto-filing.
  // Match room_suggestions against existing room names (case-insensitive) within the workspace.
  // Insert room_emails with source = 'ai' for any match.
  // Never auto-create a room. Room creation is a user action.
  let matchedRoomIds: string[] = []

  if ((extraction.room_suggestions ?? []).length > 0) {
    const { data: existingRooms, error: roomLookupError } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)

    if (roomLookupError) {
      console.error(
        `writeExtractionResults: room lookup failed for ${emailId}:`,
        roomLookupError.message,
      )
    } else if (existingRooms && existingRooms.length > 0) {
      const suggestionsLower = (extraction.room_suggestions ?? []).map((s) => s.toLowerCase())

      matchedRoomIds = existingRooms
        .filter((r) => suggestionsLower.includes(r.name.toLowerCase()))
        .map((r) => r.id)

      if (matchedRoomIds.length > 0) {
        const roomEmailRows = matchedRoomIds.map((roomId) => ({
          room_id: roomId,
          email_id: emailId,
          source: 'ai' as const,
        }))

        const { error: filingError } = await supabase
          .from('room_emails')
          .upsert(roomEmailRows, { onConflict: 'room_id,email_id', ignoreDuplicates: true })

        if (filingError) {
          console.error(
            `writeExtractionResults: room filing failed for ${emailId}:`,
            filingError.message,
          )
        }
      }
    }
  }

  // 4. Close resolved jobs.
  // closes_jobs contains IDs of existing open jobs this email resolves.
  if ((extraction.closes_jobs ?? []).length > 0) {
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'closed',
        closed_at: now,
        closed_by_email_id: emailId,
      })
      .in('id', extraction.closes_jobs ?? [])
      .eq('status', 'open')

    if (error) {
      console.error(
        `writeExtractionResults: closes_jobs update failed for ${emailId}:`,
        error.message,
      )
    }
  }

  // 5. Asset insertion is deferred.
  // Asset rows require a storage_path set at insert time (enforced by the DB not-null constraint).
  // Attachment upload to Supabase Storage is not yet implemented.
  // This will be wired in when the attachment handling brief is executed.

  return { matchedRoomIds }
}
