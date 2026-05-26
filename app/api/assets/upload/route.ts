import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

function deriveLikelyType(mimeType: string, filename: string): string | null {
  if (!mimeType && !filename) return null
  const mime = mimeType.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'Image'
  if (mime === 'application/pdf' || ext === 'pdf') return 'PDF'
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'doc' || ext === 'docx'
  ) return 'Document'
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ext === 'xls' || ext === 'xlsx' || ext === 'csv'
  ) return 'Spreadsheet'
  if (mime.startsWith('video/')) return 'Video'
  if (mime.startsWith('audio/')) return 'Audio'
  if (mime === 'application/zip' || ext === 'zip') return 'Archive'
  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the caller's workspace via RLS-scoped query.
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
  const { workspace_id: workspaceId } = membership

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

  const results: Array<
    { id: string; filename: string } | { error: string; filename: string }
  > = []

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      results.push({ error: 'File exceeds 50 MB limit', filename: file.name })
      continue
    }

    const assetId = crypto.randomUUID()
    const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
    // Workspace uploads live under a flat 'uploads' prefix, separate from room paths.
    const storagePath = `${workspaceId}/uploads/${assetId}${ext ? `.${ext}` : ''}`

    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from('assets')
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      results.push({ error: 'Upload failed', filename: file.name })
      continue
    }

    const { error: insertError } = await admin.from('assets').insert({
      id: assetId,
      workspace_id: workspaceId,
      room_id: null,
      email_id: null,
      source: 'user_upload',
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      storage_path: storagePath,
      likely_type: deriveLikelyType(file.type ?? '', file.name),
      status: 'received',
    })

    if (insertError) {
      await admin.storage.from('assets').remove([storagePath])
      results.push({ error: 'Failed to save file record', filename: file.name })
      continue
    }

    results.push({ id: assetId, filename: file.name })
  }

  const hasSuccess = results.some((r) => 'id' in r)
  return NextResponse.json({ results }, { status: hasSuccess ? 200 : 500 })
}
