import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken } from '@/lib/email/google-client'
import type { AttachmentMeta } from '@/lib/types/database'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Downloads Gmail attachment bytes and uploads them to Supabase Storage.
// Called after Tier 3 for emails that have gmail_message_id set and at least
// one attachment with a gmail_attachment_id in the metadata.
export async function fetchAndStoreGmailAttachments(
  emailId: string,
  workspaceId: string,
  gmailMessageId: string,
): Promise<void> {
  const supabase = createAdminClient()

  // Look up the Gmail account for this workspace to get a valid access token.
  const { data: account } = await supabase
    .from('email_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .limit(1)
    .maybeSingle()

  if (!account) {
    throw new Error(`fetchGmailAttachments: no Gmail account found for workspace ${workspaceId}`)
  }

  const accessToken = await getValidAccessToken(account.id)

  // Read the stored attachment metadata to find which parts have Gmail attachment IDs.
  const { data: email } = await supabase
    .from('emails')
    .select('attachments')
    .eq('id', emailId)
    .single()

  const attachments = (email?.attachments as unknown as AttachmentMeta[]) ?? []
  const downloadable = attachments.filter((a) => a.gmail_attachment_id)

  if (downloadable.length === 0) return

  const now = new Date().toISOString()

  await Promise.all(
    downloadable.map(async (attachment) => {
      // Fetch the attachment bytes from the Gmail API.
      // The response data is base64url encoded (uses - and _ instead of + and /).
      const url = `${GMAIL_API}/messages/${gmailMessageId}/attachments/${attachment.gmail_attachment_id}`
      let bytes: Buffer

      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!res.ok) {
          console.error(
            `fetchGmailAttachments: Gmail API error for ${attachment.filename} (${res.status})`,
          )
          return
        }

        const body = (await res.json()) as { data?: string }
        if (!body.data) {
          console.error(`fetchGmailAttachments: no data for ${attachment.filename}`)
          return
        }

        // Gmail API returns base64url; Buffer.from handles this with 'base64url' encoding.
        bytes = Buffer.from(body.data, 'base64url')
      } catch (err) {
        console.error(`fetchGmailAttachments: fetch error for ${attachment.filename}:`, err)
        return
      }

      const ext = attachment.filename.includes('.') ? attachment.filename.split('.').pop() : 'bin'
      const storagePath = `${workspaceId}/${emailId}/${attachment.gmail_attachment_id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(storagePath, bytes, {
          contentType: attachment.mime_type,
          upsert: true,
        })

      if (uploadError) {
        console.error(
          `fetchGmailAttachments: Storage upload failed for ${attachment.filename}:`,
          uploadError.message,
        )
        return
      }

      // Update the asset row created by writeExtractionResults (matched by filename).
      // If no row exists yet, insert one.
      const { data: existing } = await supabase
        .from('assets')
        .select('id')
        .eq('email_id', emailId)
        .eq('filename', attachment.filename)
        .maybeSingle()

      if (existing) {
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            storage_path: storagePath,
            size_bytes: attachment.size,
            mime_type: attachment.mime_type,
            status_updated_at: now,
          })
          .eq('id', existing.id)

        if (updateError) {
          console.error(
            `fetchGmailAttachments: asset update failed for ${attachment.filename}:`,
            updateError.message,
          )
        }
      } else {
        const { error: insertError } = await supabase.from('assets').insert({
          workspace_id: workspaceId,
          email_id: emailId,
          filename: attachment.filename,
          storage_path: storagePath,
          mime_type: attachment.mime_type,
          size_bytes: attachment.size,
          status: 'received',
        })

        if (insertError) {
          console.error(
            `fetchGmailAttachments: asset insert failed for ${attachment.filename}:`,
            insertError.message,
          )
        }
      }
    }),
  )
}
