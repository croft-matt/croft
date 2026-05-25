import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Generates a short-lived signed URL for a private asset and redirects to it.
// The RLS-scoped client verifies the asset belongs to the caller's workspace
// before the admin client issues the signed URL. 300-second TTL: generated at
// click time so there is no pre-generation staleness, and 300s is resilient to
// link-preview systems that fetch before the user follows the redirect.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RLS ensures this only returns rows the caller's workspace owns.
  const { data: asset, error } = await supabase
    .from('assets')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (error || !asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!asset.storage_path) {
    return NextResponse.json({ error: 'File not yet available' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('assets')
    .createSignedUrl(asset.storage_path, 300)

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
