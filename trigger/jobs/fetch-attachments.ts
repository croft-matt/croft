import { task } from '@trigger.dev/sdk/v3'
import { fetchAndStoreAttachments } from '@/lib/email/fetch-attachments'

export interface FetchAttachmentsPayload {
  emailId: string
  workspaceId: string
  resendEmailId: string
}

// Downloads inbound attachment bytes from the Resend API and writes them to
// Supabase Storage. Triggered from classifyEmail after Tier 3 completes.
// Only runs for Resend inbound emails (resendEmailId must be set).
export const fetchAttachmentsTask = task({
  id: 'fetch-attachments',
  maxDuration: 120,
  run: async (payload: FetchAttachmentsPayload) => {
    const { emailId, workspaceId, resendEmailId } = payload

    if (!emailId || !workspaceId || !resendEmailId) {
      throw new Error(
        `fetch-attachments: missing required payload fields (emailId=${emailId}, workspaceId=${workspaceId}, resendEmailId=${resendEmailId})`,
      )
    }

    await fetchAndStoreAttachments(emailId, workspaceId, resendEmailId)

    return { emailId }
  },
})
