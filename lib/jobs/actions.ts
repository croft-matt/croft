'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/helpers'

export interface JobActionResult {
  success: boolean
  error?: string
}

// Snoozes a job by updating its due date.
// When a dedicated snoozed_until column is added to the jobs table,
// update this to use that column instead.
export async function snoozeJob(jobId: string, snoozeUntil: Date): Promise<JobActionResult> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('jobs')
    .update({
      due: snoozeUntil.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
