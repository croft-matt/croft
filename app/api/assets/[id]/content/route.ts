import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Proxies file bytes through Croft's own origin so <img> and <iframe> can
// embed private assets without cross-origin restrictions. Generates a fresh
// 60-second signed URL on each request so there is no TTL staleness.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // RLS-scoped client: only returns rows the caller's workspace owns.
  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, storage_path, mime_type, filename')
    .eq('id', id)
    .maybeSingle()

  if (error || !asset) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (!asset.storage_path) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()
  const { data: signed, error: signError } = await admin.storage
    .from('assets')
    .createSignedUrl(asset.storage_path, 60)

  if (signError || !signed?.signedUrl) {
    return new NextResponse('Failed to access file', { status: 500 })
  }

  const fileResponse = await fetch(signed.signedUrl)
  if (!fileResponse.ok) {
    return new NextResponse('Failed to fetch file', { status: 502 })
  }

  const contentType = asset.mime_type ?? 'application/octet-stream'
  const filename = asset.filename ?? 'file'

  // RFC 5987 encoding eliminates header injection via special characters in filenames.
  const encodedFilename = `UTF-8''${encodeURIComponent(filename)}`

  const download = new URL(request.url).searchParams.get('download') === 'true'

  // Only serve known-safe types inline. HTML, SVG, and JS execute in the user's
  // authenticated session if rendered at this origin, so force download for those.
  const safeInline = /^(image\/(?!svg\+xml)|application\/pdf|video\/|audio\/)/.test(contentType)
  const forceDownload = download || !safeInline

  const disposition = forceDownload
    ? `attachment; filename*=${encodedFilename}`
    : `inline; filename*=${encodedFilename}`

  return new NextResponse(fileResponse.body, {
    headers: {
      'Content-Type': forceDownload ? 'application/octet-stream' : contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
