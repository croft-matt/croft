import { task } from '@trigger.dev/sdk/v3'
import { runMatcherForContact } from '@/lib/contacts/matcher'

export interface MatchContactPayload {
  contactId: string
  workspaceId: string
}

// Incremental matcher job. Fired after a contact is upserted during Tier 3.
// Compares the contact against all other workspace contacts and writes pending
// merge candidates for pairs that look like the same person.
// Low-priority: runs after room synthesis and attachment jobs.
export const matchContactTask = task({
  id: 'match-contact',
  maxDuration: 60,
  run: async (payload: MatchContactPayload) => {
    const { contactId, workspaceId } = payload
    await runMatcherForContact(contactId, workspaceId)
    return { contactId }
  },
})
