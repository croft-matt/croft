// One-off backfill: assigns thread_id to all emails that were ingested before
// thread linkage was added. Reply headers are not available for historical emails,
// so this relies on rules 3 and 4 from the resolveThreadId logic:
// - Derived key from normalised subject + participant set (groups most threads correctly)
// - New UUID for anything that cannot be keyed (no subject, no participants)
//
// Run with:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-thread-id.ts
//
// Safe to run multiple times: skips emails that already have a thread_id.

import { createHash, randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database'

const BATCH_SIZE = 200

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

function normaliseSubject(subject: string | null): string {
  let s = (subject ?? '').toLowerCase().trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^(re|fwd|fw)\s*:\s*/, '').trim()
  }
  return s
}

function derivedKey(
  workspaceId: string,
  subject: string | null,
  fromAddress: string,
  toAddresses: string[],
  ccAddresses: string[],
): string {
  const normSubject = normaliseSubject(subject)
  const participants = [fromAddress, ...toAddresses, ...ccAddresses]
    .map((a) => a.toLowerCase().trim())
    .filter(Boolean)
    .sort()

  if (!normSubject && participants.length === 0) return randomUUID()

  return createHash('sha1')
    .update(`${workspaceId}|${normSubject}|${participants.join(',')}`)
    .digest('hex')
}

async function run(): Promise<void> {
  console.log('Starting thread_id backfill...')

  let offset = 0
  let totalUpdated = 0

  while (true) {
    const { data: emails, error } = await supabase
      .from('emails')
      .select('id, workspace_id, subject, from_address, to_addresses, cc_addresses')
      .is('thread_id', null)
      .order('received_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) throw new Error(`backfill: fetch failed: ${error.message}`)
    if (!emails || emails.length === 0) break

    for (const email of emails) {
      const key = derivedKey(
        email.workspace_id,
        email.subject,
        email.from_address,
        (email.to_addresses as string[]),
        (email.cc_addresses as string[]),
      )

      const { error: updateError } = await supabase
        .from('emails')
        .update({ thread_id: key })
        .eq('id', email.id)
        .is('thread_id', null)

      if (updateError) {
        console.error(`backfill: failed to update ${email.id}:`, updateError.message)
      } else {
        totalUpdated++
      }
    }

    console.log(`  processed ${offset + emails.length} emails, updated ${totalUpdated}`)
    offset += emails.length

    if (emails.length < BATCH_SIZE) break
  }

  console.log(`Backfill complete. Updated ${totalUpdated} emails.`)
}

run().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
