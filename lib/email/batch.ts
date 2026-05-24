import { createAdminClient } from '@/lib/supabase/admin'
import { runFullClassification, type RateLimitHeaders } from '@/lib/ai/tier3'
import { getReconciliationContext } from '@/lib/ai/reconciliation-context'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { fileEmailToRooms } from '@/lib/rooms/file'
import { tasks } from '@trigger.dev/sdk/v3'
import type { synthesiseRoomTask } from '@/trigger/jobs/synthesise-room'
import type { fetchAttachmentsTask } from '@/trigger/jobs/fetch-attachments'
import type { fetchGmailAttachmentsTask } from '@/trigger/jobs/fetch-gmail-attachments'
import type { AttachmentMeta, Extraction } from '@/lib/types/database'
import type { Json } from '@/lib/types/database'

// Processes a single queued email through Tier 3.
// Used by both the batch scheduled job and the on-demand job.
// Sequential processing is intentional: each call reuses the cached Tier 3 system prompt.
// Do not parallelise within a workspace.
export interface ClassifyEmailResult {
  rateLimitHeaders?: RateLimitHeaders
}

export async function classifyEmail(emailId: string): Promise<ClassifyEmailResult> {
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
      await supabase.from('emails').update({ embedding: embedding as unknown as string }).eq('id', emailId)
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
        extraction: result.extraction as unknown as Json,
        extraction_complete: result.extraction_complete,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)

    const rateLimitHeaders = result.rateLimitHeaders

    // Write structured intelligence derived from the extraction.
    // These writes are non-fatal: failure here does not mark the email as failed.
    // The email processed successfully. Write errors are logged and retried separately.
    const { matchedRoomIds } = await writeExtractionResults(emailId, email.workspace_id, result.extraction, candidateJobIds, email.attachments as unknown as AttachmentMeta[])

    // Enqueue room synthesis for each room the email was filed into.
    // Pass emailId so facts from this email are merged into room_data.
    // Non-fatal: a synthesis failure must not affect the email's processing state.
    for (const roomId of matchedRoomIds) {
      tasks.trigger<typeof synthesiseRoomTask>('synthesise-room', { roomId, emailId }).catch((err: unknown) => {
        console.error(`classifyEmail: synthesis trigger failed for room ${roomId}:`, err)
      })
    }

    // Download attachment bytes and upload to Storage.
    // Non-fatal: attachment fetch failure must not affect the email's processing state.
    const storedAttachments = email.attachments as unknown as AttachmentMeta[]
    if (storedAttachments.length > 0) {
      if (email.resend_email_id) {
        tasks
          .trigger<typeof fetchAttachmentsTask>('fetch-attachments', {
            emailId,
            workspaceId: email.workspace_id,
            resendEmailId: email.resend_email_id,
          })
          .catch((err: unknown) => {
            console.error(`classifyEmail: fetch-attachments trigger failed for ${emailId}:`, err)
          })
      } else if (email.gmail_message_id) {
        tasks
          .trigger<typeof fetchGmailAttachmentsTask>('fetch-gmail-attachments', {
            emailId,
            workspaceId: email.workspace_id,
            gmailMessageId: email.gmail_message_id,
          })
          .catch((err: unknown) => {
            console.error(`classifyEmail: fetch-gmail-attachments trigger failed for ${emailId}:`, err)
          })
      }
    }

    // Embedding is stored above before classification. No separate background job needed.
    return { rateLimitHeaders }
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
  attachments: AttachmentMeta[],
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
    // DELIVER and CONFIRM are events, not standing actions. They never create
    // open jobs regardless of what the model returns. Their role is to close
    // resolved jobs via closes_jobs and contribute facts.
    if (j.intent === 'DELIVER' || j.intent === 'CONFIRM') continue

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

  // 3. Room filing.
  // Path-based: each suggestion is an ordered array from root to leaf.
  // Exact and fuzzy matching against existing rooms. Auto-creates missing nodes.
  const { matchedRoomIds } = await fileEmailToRooms(
    emailId,
    workspaceId,
    extraction.room_suggestions ?? [],
  )

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

  // 5. Insert asset rows from extraction.
  // One row per asset mention. Actual file bytes are not available at this point —
  // storage_path is left null and populated later when attachment bytes are fetched.
  // Cross-reference by filename against the email's attachment metadata to pick up
  // mime_type and size_bytes when a real attachment exists.
  const extractedAssets = extraction.entities?.assets ?? []
  if (extractedAssets.length > 0) {
    const attachmentByFilename = new Map(attachments.map((a) => [a.filename, a]))

    const assetRows = extractedAssets.map((a) => {
      const meta = attachmentByFilename.get(a.filename)
      return {
        workspace_id: workspaceId,
        email_id: emailId,
        filename: a.filename,
        likely_type: a.likely_type,
        confidence: a.confidence,
        mime_type: meta?.mime_type ?? null,
        size_bytes: meta?.size ?? null,
        status: 'received',
      }
    })

    const { error } = await supabase.from('assets').insert(assetRows)
    if (error) {
      console.error(`writeExtractionResults: assets insert failed for ${emailId}:`, error.message)
    }
  }

  return { matchedRoomIds }
}
