import { createAdminClient } from '@/lib/supabase/admin'
import { runFullClassification } from '@/lib/ai/tier3'
import { embedTask } from '@/trigger/jobs/embed'

// Processes a single queued email through Tier 3.
// Used by both the batch scheduled job and the on-demand job.
// Sequential processing is intentional: each call reuses the cached Tier 3 system prompt.
// Do not parallelise within a workspace.
export async function classifyEmail(emailId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('emails')
    .update({ processing_state: 'processing' })
    .eq('id', emailId)

  try {
    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) throw new Error(`classify: email ${emailId} not found`)

    const result = await runFullClassification(email)

    await supabase
      .from('emails')
      .update({
        processing_state: 'processed',
        subject_summary: result.subject_summary,
        extraction: result.extraction,
        extraction_complete: result.extraction_complete,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)

    // Enqueue embedding generation as a separate low-priority job.
    // Never block Tier 3 completion on this.
    await embedTask.trigger({ emailId })
  } catch (err) {
    await supabase
      .from('emails')
      .update({ processing_state: 'failed' })
      .eq('id', emailId)

    throw err
  }
}
