import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMatcherForContact } from '@/lib/contacts/matcher'

export interface BackfillContactMatchingPayload {
  workspaceId: string
}

// One-time backfill job. Sweeps all contacts for a workspace and runs the
// matcher on each sequentially. Intended to seed candidates from contacts
// that existed before the identity layer was deployed.
// Safe to run multiple times: the matcher skips dismissed pairs and the
// unique constraint prevents duplicate pending rows.
export const backfillContactMatchingTask = task({
  id: 'backfill-contact-matching',
  maxDuration: 300,
  run: async (payload: BackfillContactMatchingPayload) => {
    const { workspaceId } = payload
    const supabase = createAdminClient()

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .order('last_seen_at', { ascending: false })

    const total = contacts?.length ?? 0
    let processed = 0
    let failed = 0

    for (const contact of contacts ?? []) {
      try {
        await runMatcherForContact(contact.id, workspaceId)
        processed++
      } catch (err) {
        console.error(`backfill-contact-matching: failed for ${contact.id}:`, err)
        failed++
      }
    }

    return { workspaceId, total, processed, failed }
  },
})
