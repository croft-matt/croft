import { task } from '@trigger.dev/sdk/v3'
import type { EmailSource } from '@/lib/email/first-party'
import { handleUserCc } from '@/lib/email/first-party-cc'

export interface ProcessFirstPartyPayload {
  emailId: string
  source: Exclude<EmailSource, 'inbound'>
  workspaceId: string
}

// Handles emails sent by the connected user to Croft's inbound address.
// Skips the standard tier-1 noise gate and tier-2 urgency scan entirely --
// these exist for strangers' emails and are irrelevant for first-party input.
//
// Two source types are routed here:
//   user_cc     : Matt CC'd Croft on an outbound email (Brief 37)
//   user_direct : Matt emailed Croft directly, no third-party recipients (Briefs 38 and 39)
//
// Brief 37 implements user_cc.
// Briefs 38 and 39 fill in user_direct.
export const processFirstPartyTask = task({
  id: 'process-first-party',
  maxDuration: 120,
  run: async (payload: ProcessFirstPartyPayload) => {
    const { emailId, source, workspaceId } = payload

    if (source === 'user_cc') {
      await handleUserCc(emailId, workspaceId)
      return { emailId, source, status: 'processed' }
    }

    if (source === 'user_direct') {
      // Brief 38: proactive room creation / watch context.
      // Brief 39: room commands (remove, merge, rename, archive).
      return { emailId, source, status: 'pending_brief_38_39' }
    }
  },
})
