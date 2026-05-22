import { task } from '@trigger.dev/sdk/v3'
import { fetchAndStoreGmailAttachments } from '@/lib/email/fetch-gmail-attachments'

export interface FetchGmailAttachmentsPayload {
  emailId: string
  workspaceId: string
  gmailMessageId: string
}

// Downloads Gmail attachment bytes and writes them to Supabase Storage.
// Triggered from classifyEmail after Tier 3 completes, for Gmail emails only.
export const fetchGmailAttachmentsTask = task({
  id: 'fetch-gmail-attachments',
  maxDuration: 120,
  run: async (payload: FetchGmailAttachmentsPayload) => {
    const { emailId, workspaceId, gmailMessageId } = payload

    if (!emailId || !workspaceId || !gmailMessageId) {
      throw new Error(
        `fetch-gmail-attachments: missing required payload fields (emailId=${emailId}, workspaceId=${workspaceId}, gmailMessageId=${gmailMessageId})`,
      )
    }

    await fetchAndStoreGmailAttachments(emailId, workspaceId, gmailMessageId)

    return { emailId }
  },
})
