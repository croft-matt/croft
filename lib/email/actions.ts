'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'
import { tasks } from '@trigger.dev/sdk/v3'
import type { classifyNowTask } from '@/trigger/jobs/classify-now'
import type { Email, Job, Asset, ExtractedContact, Extraction } from '@/lib/types/database'

// Enqueues on-demand Tier 3 for an email if it is queued or urgency_scanned.
// Safe to call multiple times: if already processing or processed, does nothing.
export async function triggerClassifyNow(emailId: string): Promise<void> {
  await requireUser()

  const supabase = await createClient()
  const { data } = await supabase
    .from('emails')
    .select('processing_state')
    .eq('id', emailId)
    .single()

  if (!data) return
  if (!['queued', 'urgency_scanned'].includes(data.processing_state)) return

  await tasks.trigger<typeof classifyNowTask>('classify-now', { emailId }).catch((err: unknown) => {
    console.error(`triggerClassifyNow: trigger failed for ${emailId}:`, err)
  })
}

export interface EmailExtractionData {
  email: Email
  jobs: Job[]
  assets: Asset[]
  extractedContacts: ExtractedContact[]
}

// Returns the latest extraction data for an email after processing completes.
// Called by EmailProcessingProvider when Realtime signals processing_state = processed.
export async function getEmailExtractionData(emailId: string): Promise<EmailExtractionData | null> {
  await requireUser()

  const supabase = await createClient()

  const [{ data: email }, { data: jobs }, { data: assets }] = await Promise.all([
    supabase.from('emails').select('*').eq('id', emailId).single(),
    supabase.from('jobs').select('*').eq('email_id', emailId).order('created_at', { ascending: true }),
    supabase.from('assets').select('*').eq('email_id', emailId).order('created_at', { ascending: true }),
  ])

  if (!email) return null

  const extractedContacts = ((email.extraction as Extraction | null)?.entities?.contacts ?? []) as ExtractedContact[]

  return {
    email: email as Email,
    jobs: (jobs ?? []) as Job[],
    assets: (assets ?? []) as Asset[],
    extractedContacts,
  }
}
