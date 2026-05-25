'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { tasks } from '@trigger.dev/sdk/v3'
import type { classifyNowTask } from '@/trigger/jobs/classify-now'
import type { Email, Job, Asset, ExtractedContact, Extraction, Room } from '@/lib/types/database'
import {
  getEmailById,
  getJobsByEmailId,
  getAssetsByEmailId,
  getContactsMentionedInEmail,
  getRoomsForEmail,
} from '@/lib/queries/emails'

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

export interface EmailPanelData {
  email: Email
  jobs: Job[]
  assets: Asset[]
  extractedContacts: ExtractedContact[]
  rooms: Pick<Room, 'id' | 'name'>[]
  workspaceId: string
}

// Returns all data needed to render the email detail view inside the side panel.
// getContactsMentionedInEmail is a pure sync function that reads from email.extraction,
// so the email must be fetched first before calling it.
export async function getEmailPanelData(emailId: string): Promise<EmailPanelData | null> {
  await requireUser()

  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return null

  const email = await getEmailById(emailId)
  if (!email) return null

  const [jobs, assets, rooms] = await Promise.all([
    getJobsByEmailId(emailId),
    getAssetsByEmailId(emailId),
    getRoomsForEmail(emailId),
  ])

  const extractedContacts = getContactsMentionedInEmail(email)

  return { email, jobs, assets, extractedContacts, rooms, workspaceId }
}
