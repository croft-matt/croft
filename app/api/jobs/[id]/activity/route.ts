import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { getJobActivity } from '@/lib/queries/job-activity'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await requireUser()
  const { id: jobId } = await params

  const supabase = await createClient()

  // Verify workspace membership via the job's workspace.
  const { data: job } = await supabase
    .from('jobs')
    .select('workspace_id')
    .eq('id', jobId)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', job.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await getJobActivity(jobId)
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
