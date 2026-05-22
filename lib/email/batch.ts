import { createAdminClient } from '@/lib/supabase/admin'
import { runFullClassification } from '@/lib/ai/tier3'
import { getReconciliationContext } from '@/lib/ai/reconciliation-context'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { tasks } from '@trigger.dev/sdk/v3'
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

    // Generate and store the embedding before classification so the semantic layer
    // in getReconciliationContext has a vector to search with.
    // Non-fatal: if embedding fails, proceed with thread and room layers only.
    let embedding: number[] | undefined
    try {
      embedding = await generateEmbedding(email)
      await supabase.from('emails').update({ embedding }).eq('id', emailId)
    } catch (err) {
      console.error(`classifyEmail: embedding failed for ${emailId}:`, err)
    }

    const context = await getReconciliationContext(email, embedding)
    const candidateJobIds = new Set(context.openJobs.map((j) => j.id))
    const result = await runFullClassification(email, context)

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
    const { matchedRoomIds } = await writeExtractionResults(emailId, email.workspace_id, result.extraction, candidateJobIds)

    // Enqueue room synthesis for each room the email was filed into.
    // Pass emailId so facts from this email are merged into room_data.
    // Non-fatal: a synthesis failure must not affect the email's processing state.
    for (const roomId of matchedRoomIds) {
      tasks.trigger<typeof synthesiseRoomTask>('synthesise-room', { roomId, emailId }).catch((err: unknown) => {
        console.error(`classifyEmail: synthesis trigger failed for room ${roomId}:`, err)
      })
    }

    // Embedding is stored above before classification. No separate background job needed.
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
  candidateJobIds: Set<string>,
): Promise<{ matchedRoomIds: string[] }> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // 1. Process jobs by reconciliation verdict.
  // Each extracted job is routed by its relation field rather than blindly inserted.
  // relates_to_job_id and closes_jobs ids are validated against candidateJobIds
  // to prevent a hallucinated id from touching an unrelated job.
  const jobsToInsert: Array<{
    workspace_id: string
    email_id: string
    intent: string
    description: string
    owner: string | null
    due: string | null
    confidence: number
    status: 'open'
    parent_job_id: string | null
  }> = []
  const updatesNeeded: Array<{ id: string; description: string; due: string | null }> = []
  const touchNeeded: string[] = []

  for (const j of extraction.jobs ?? []) {
    const relation = j.relation ?? 'new'
    const relatesTo =
      j.relates_to_job_id && candidateJobIds.has(j.relates_to_job_id)
        ? j.relates_to_job_id
        : null

    const baseRow = {
      workspace_id: workspaceId,
      email_id: emailId,
      intent: j.intent,
      description: j.description,
      owner: j.owner ?? null,
      due: j.due ?? null,
      confidence: j.confidence,
      status: 'open' as const,
    }

    switch (relation) {
      case 'duplicate':
        // Do not insert. Touch the target's updated_at to reflect fresh activity.
        if (relatesTo) touchNeeded.push(relatesTo)
        // If relatesTo is invalid, discard silently — we cannot identify the target.
        break

      case 'update':
        if (relatesTo) {
          // Patch description and due on the target. Conservative: only open jobs.
          updatesNeeded.push({ id: relatesTo, description: j.description, due: j.due ?? null })
        } else {
          // Cannot identify target; insert as new to avoid losing the information.
          jobsToInsert.push({ ...baseRow, parent_job_id: null })
        }
        break

      case 'chase_of':
        // Insert as a CHASE with parent_job_id pointing to the original REQUEST.
        jobsToInsert.push({ ...baseRow, parent_job_id: relatesTo })
        break

      case 'new':
      default:
        jobsToInsert.push({ ...baseRow, parent_job_id: null })
        break
    }
  }

  if (jobsToInsert.length > 0) {
    const { error } = await supabase.from('jobs').insert(jobsToInsert)
    if (error) {
      console.error(`writeExtractionResults: jobs insert failed for ${emailId}:`, error.message)
    }
  }

  for (const upd of updatesNeeded) {
    const { error } = await supabase
      .from('jobs')
      .update({ description: upd.description, due: upd.due, updated_at: now })
      .eq('id', upd.id)
      .eq('status', 'open')
    if (error) {
      console.error(`writeExtractionResults: job update failed for ${upd.id}:`, error.message)
    }
  }

  if (touchNeeded.length > 0) {
    const { error } = await supabase
      .from('jobs')
      .update({ updated_at: now })
      .in('id', touchNeeded)
    if (error) {
      console.error(`writeExtractionResults: jobs touch failed:`, error.message)
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
  // Validate each id against candidateJobIds before acting to prevent hallucinated
  // ids from closing unrelated jobs.
  const validClosesJobs = (extraction.closes_jobs ?? []).filter((id) => candidateJobIds.has(id))

  if (validClosesJobs.length > 0) {
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'closed',
        closed_at: now,
        closed_by_email_id: emailId,
      })
      .in('id', validClosesJobs)
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
