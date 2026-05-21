'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface JobContext {
  roomName: string | null
  senderName: string | null
  senderEmail: string | null
  sourceEmailId: string | null
  toAddresses: string[]
  ccAddresses: string[]
  fromAddress: string | null
}

export async function getJobContext(jobId: string): Promise<JobContext> {
  await requireUser()
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('jobs')
    .select('email_id')
    .eq('id', jobId)
    .single()

  if (!job) {
    return { roomName: null, senderName: null, senderEmail: null, sourceEmailId: null, toAddresses: [], ccAddresses: [], fromAddress: null }
  }

  const { data: email } = await supabase
    .from('emails')
    .select('id, from_name, from_address, to_addresses, cc_addresses')
    .eq('id', job.email_id)
    .single()

  if (!email) {
    return { roomName: null, senderName: null, senderEmail: null, sourceEmailId: job.email_id, toAddresses: [], ccAddresses: [], fromAddress: null }
  }

  const { data: roomEmail } = await supabase
    .from('room_emails')
    .select('rooms(name)')
    .eq('email_id', email.id)
    .limit(1)
    .maybeSingle()

  const roomName = (roomEmail?.rooms as { name: string } | null)?.name ?? null

  return {
    roomName,
    senderName: email.from_name ?? null,
    senderEmail: email.from_address ?? null,
    sourceEmailId: email.id,
    toAddresses: (email.to_addresses as string[]) ?? [],
    ccAddresses: (email.cc_addresses as string[]) ?? [],
    fromAddress: email.from_address ?? null,
  }
}
