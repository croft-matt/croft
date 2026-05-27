import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAttachmentText } from '@/lib/email/extract-attachment-text'

const resend = new Resend(process.env.RESEND_API_KEY)

// Downloads inbound attachment bytes from the Resend API and uploads them to
// Supabase Storage. Called after Tier 3 so that asset rows created by
// writeExtractionResults already exist and can be enriched with storage_path.
//
// For attachments with no matching asset row (Tier 3 missed or hasn't run),
// a new row is inserted with whatever metadata is available from Resend.
//
// Resend stores inbound email content indefinitely. The download_url expires
// after 1 hour but calling this API always returns a fresh URL.
export async function fetchAndStoreAttachments(
  emailId: string,
  workspaceId: string,
  resendEmailId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // SDK response: { data: { object, has_more, data: AttachmentData[] } | null, error }
  const { data: listResponse, error } = await resend.emails.receiving.attachments.list({
    emailId: resendEmailId,
  })

  if (error) {
    throw new Error(`fetchAttachments: Resend API error for email ${emailId}: ${error.message}`)
  }

  // Exclude inline attachments (Outlook tracking pixels, embedded images, CID references).
  const attachments = (listResponse?.data ?? []).filter(
    (a) => a.content_disposition !== 'inline' && !a.content_id,
  )
  const now = new Date().toISOString()

  for (const attachment of attachments) {
    const filename = attachment.filename ?? `attachment-${attachment.id}`

    // Fetch file bytes from the signed Resend URL.
    let bytes: Buffer
    try {
      const res = await fetch(attachment.download_url)
      if (!res.ok) {
        console.error(`fetchAttachments: download failed for ${filename} (${res.status})`)
        continue
      }
      bytes = Buffer.from(await res.arrayBuffer())
    } catch (err) {
      console.error(`fetchAttachments: fetch error for ${filename}:`, err)
      continue
    }

    // Extract text for backfill / retry cases where pre-classification extraction missed this file.
    // Non-fatal: extraction failure must not block the storage upload.
    let extractedText: string | null = null
    try {
      extractedText = await extractAttachmentText(bytes, attachment.content_type, filename)
    } catch (err) {
      console.error(`fetchAttachments: text extraction failed for ${filename}:`, err)
    }

    // Derive a stable storage path from the attachment's Resend ID so that
    // re-running this job is safe (upsert: true prevents duplicate uploads).
    const ext = filename.includes('.') ? filename.split('.').pop() : 'bin'
    const storagePath = `${workspaceId}/${emailId}/${attachment.id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(storagePath, bytes, {
        contentType: attachment.content_type,
        upsert: true,
      })

    if (uploadError) {
      console.error(
        `fetchAttachments: Storage upload failed for ${filename}:`,
        uploadError.message,
      )
      continue
    }

    // Try to find the asset row created by writeExtractionResults (matched by
    // email_id + filename). Prefer rows that still have no storage_path so that
    // a file already downloaded is not overwritten.
    const { data: existing } = await supabase
      .from('assets')
      .select('id')
      .eq('email_id', emailId)
      .eq('filename', filename)
      .maybeSingle()

    if (existing) {
      // Patch storage fields. Also backfill extracted_text if not already set
      // (the pre-classification step normally writes this, but may have failed).
      const { data: currentAsset } = await supabase
        .from('assets')
        .select('extracted_text')
        .eq('id', existing.id)
        .single()

      const { error: updateError } = await supabase
        .from('assets')
        .update({
          storage_path: storagePath,
          size_bytes: attachment.size,
          mime_type: attachment.content_type,
          status_updated_at: now,
          // Only backfill extracted_text if not already populated.
          ...(!currentAsset?.extracted_text && extractedText ? { extracted_text: extractedText } : {}),
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error(
          `fetchAttachments: asset update failed for ${filename}:`,
          updateError.message,
        )
      }
    } else {
      // No row from Tier 3 — insert directly.
      const { error: insertError } = await supabase.from('assets').insert({
        workspace_id: workspaceId,
        email_id: emailId,
        filename,
        storage_path: storagePath,
        mime_type: attachment.content_type,
        size_bytes: attachment.size,
        extracted_text: extractedText,
        status: 'received',
      })

      if (insertError) {
        console.error(
          `fetchAttachments: asset insert failed for ${filename}:`,
          insertError.message,
        )
      }
    }
  }
}
