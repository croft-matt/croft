import { createClient } from '@/lib/supabase/server'
import type { Email, Job, Asset, Room, ExtractedContact } from '@/lib/types/database'

export async function getEmailById(id: string): Promise<Email | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('emails')
    .select('*')
    .eq('id', id)
    .single()
  return (data as Email) ?? null
}

export async function getJobsByEmailId(emailId: string): Promise<Job[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true })
  return (data ?? []) as Job[]
}

export async function getAssetsByEmailId(emailId: string): Promise<Asset[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('assets')
    .select('*')
    .eq('email_id', emailId)
    .order('created_at', { ascending: true })
  return (data ?? []) as Asset[]
}

// Contacts mentioned in this email come from the extraction JSONB, not the contacts table.
// They represent the people the AI identified within the email content.
export function getContactsMentionedInEmail(email: Email): ExtractedContact[] {
  return (email.extraction?.entities?.contacts ?? []) as ExtractedContact[]
}

export async function getRoomsForEmail(emailId: string): Promise<Pick<Room, 'id' | 'name'>[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('room_emails')
    .select('rooms(id, name)')
    .eq('email_id', emailId)

  return (data ?? [])
    .map((r) => r.rooms as Pick<Room, 'id' | 'name'> | null)
    .filter((r): r is Pick<Room, 'id' | 'name'> => r !== null)
}
