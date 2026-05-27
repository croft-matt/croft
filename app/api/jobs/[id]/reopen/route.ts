import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser()
  const { id: jobId } = await params

  const supabase = await createClient()

  // Fetch the job to verify it exists and the user has access via workspace membership.
  const { data: job } = await supabase
    .from('jobs')
    .select('id, workspace_id, status')
    .eq('id', jobId)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify the calling user is a member of the job's workspace.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', job.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (job.status !== 'closed') {
    return NextResponse.json({ error: 'Job is not closed' }, { status: 400 })
  }

  const { error } = await supabase
    .from('jobs')
    .update({ status: 'open', closed_at: null, closed_by_email_id: null })
    .eq('id', jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
