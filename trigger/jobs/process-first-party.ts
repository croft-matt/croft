import { task } from '@trigger.dev/sdk/v3'
import type { EmailSource } from '@/lib/email/first-party'
import { handleUserCc } from '@/lib/email/first-party-cc'
import {
  containsRoomLink,
  handleCommand,
  handleProactiveCreation,
} from '@/lib/email/first-party-direct'
import { createAdminClient } from '@/lib/supabase/admin'

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
      // Fetch the email body to check for a room URL before dispatching.
      // body_text may already be populated if fetch-body ran during ingestion.
      const supabase = createAdminClient()
      const { data: email } = await supabase
        .from('emails')
        .select('body_text')
        .eq('id', emailId)
        .single()

      const body = email?.body_text ?? ''

      if (containsRoomLink(body)) {
        // Brief 39: Matt is acting on an existing room via a URL in the body.
        await handleCommand(emailId, workspaceId)
        return { emailId, source, status: 'processed' }
      }

      // Brief 38: no room URL -- Matt is creating rooms proactively.
      await handleProactiveCreation(emailId, workspaceId)
      return { emailId, source, status: 'processed' }
    }
  },
})
