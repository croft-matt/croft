// Pre-classification attachment text extraction.
// Runs synchronously before Tier 3 so attachment content is available to the model.
//
// For Resend inbound emails: fetches bytes via Resend API (download_url is always fresh).
// For Gmail emails: fetches bytes via Gmail attachment API using the stored gmail_attachment_id.
//
// Stores extracted_text to the assets table immediately (upsert by email_id + filename).
// The background fetch-attachments job runs later to store the actual bytes in Storage —
// this function only writes text, not binary bytes.
//
// Always returns an array (empty on any failure). Never throws.

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import { extractAttachmentText } from '@/lib/email/extract-attachment-text'
import type { AttachmentMeta } from '@/lib/types/database'

const resend = new Resend(process.env.RESEND_API_KEY)
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface AttachmentText {
  filename: string
  text: string
}

// Fetches and extracts text from all attachments on an email.
// Detects Resend vs Gmail path from the provided IDs.
export async function fetchAttachmentTexts(
  emailId: string,
  workspaceId: string,
  resendEmailId: string | null,
  gmailMessageId: string | null,
): Promise<AttachmentText[]> {
  const supabase = createAdminClient()

  // Load attachment metadata from the email row
  const { data: email } = await supabase
    .from('emails')
    .select('attachments')
    .eq('id', emailId)
    .single()

  const attachments = (email?.attachments as unknown as AttachmentMeta[] | null) ?? []

  // Exclude inline attachments (tracking pixels, embedded images)
  const extractable = attachments.filter(
    (a) => a.content_disposition !== 'inline' && !a.content_id,
  )

  if (extractable.length === 0) return []

  const results: AttachmentText[] = []

  if (resendEmailId) {
    // Resend path: list attachments to get fresh download URLs, then fetch bytes
    let downloadable: Array<{ filename: string; download_url: string; content_type: string; id: string }>
    try {
      const { data: listResponse, error } = await resend.emails.receiving.attachments.list({
        emailId: resendEmailId,
      })
      if (error || !listResponse?.data) {
        console.error(`fetchAttachmentTexts: Resend list failed for email ${emailId}:`, error?.message)
        return []
      }
      downloadable = (listResponse.data ?? [])
        .filter((a) => a.content_disposition !== 'inline' && !a.content_id && a.filename)
        .map((a) => ({ ...a, filename: a.filename! }))
    } catch (err) {
      console.error(`fetchAttachmentTexts: Resend list error for email ${emailId}:`, err)
      return []
    }

    await Promise.all(
      downloadable.map(async (attachment) => {
        try {
          const res = await fetch(attachment.download_url)
          if (!res.ok) {
            console.error(`fetchAttachmentTexts: download failed for ${attachment.filename} (${res.status})`)
            return
          }
          const bytes = Buffer.from(await res.arrayBuffer())
          const text = await extractAttachmentText(bytes, attachment.content_type, attachment.filename)
          if (text) {
            results.push({ filename: attachment.filename, text })
            await storeExtractedText(emailId, workspaceId, attachment.filename, text, supabase)
          }
        } catch (err) {
          console.error(`fetchAttachmentTexts: error processing ${attachment.filename}:`, err)
        }
      }),
    )
  } else if (gmailMessageId) {
    // Gmail path: use attachment IDs stored in metadata to fetch bytes
    const downloadable = extractable.filter((a) => a.gmail_attachment_id)

    if (downloadable.length === 0) return []

    // Get Gmail access token via the workspace's Google account
    let accessToken: string
    try {
      const { data: account } = await supabase
        .from('email_accounts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('provider', 'google')
        .limit(1)
        .maybeSingle()

      if (!account) {
        console.error(`fetchAttachmentTexts: no Gmail account for workspace ${workspaceId}`)
        return []
      }
      accessToken = await getValidAccessToken(account.id)
    } catch (err) {
      console.error(`fetchAttachmentTexts: Gmail token error for workspace ${workspaceId}:`, err)
      return []
    }

    await Promise.all(
      downloadable.map(async (attachment) => {
        try {
          const url = `${GMAIL_API}/messages/${gmailMessageId}/attachments/${attachment.gmail_attachment_id}`
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          if (!res.ok) {
            console.error(`fetchAttachmentTexts: Gmail API error for ${attachment.filename} (${res.status})`)
            return
          }

          const body = (await res.json()) as { data?: string }
          if (!body.data) return

          const bytes = Buffer.from(body.data, 'base64url')
          const text = await extractAttachmentText(bytes, attachment.mime_type, attachment.filename)
          if (text) {
            results.push({ filename: attachment.filename, text })
            await storeExtractedText(emailId, workspaceId, attachment.filename, text, supabase)
          }
        } catch (err) {
          console.error(`fetchAttachmentTexts: error processing ${attachment.filename}:`, err)
        }
      }),
    )
  }

  return results
}

// Upserts extracted_text on the asset row for a given email + filename.
// Creates a stub asset row if one does not yet exist (Tier 3 may not have run).
async function storeExtractedText(
  emailId: string,
  workspaceId: string,
  filename: string,
  text: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('assets')
      .select('id')
      .eq('email_id', emailId)
      .eq('filename', filename)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('assets')
        .update({ extracted_text: text })
        .eq('id', existing.id)
    } else {
      // Tier 3 hasn't run yet — insert a stub row so the text is available
      await supabase.from('assets').insert({
        workspace_id: workspaceId,
        email_id: emailId,
        filename,
        extracted_text: text,
        status: 'received',
      })
    }
  } catch (err) {
    console.error(`fetchAttachmentTexts: storeExtractedText failed for ${filename}:`, err)
  }
}
