import { createClient } from '@/lib/supabase/server'

export type AssetFileType = 'pdf' | 'spreadsheet' | 'image' | 'document' | 'other'

export interface WorkspaceAsset {
  id: string
  filename: string
  likelyType: string | null
  mimeType: string | null
  sizeBytes: number | null
  fileType: AssetFileType
  createdAt: string
  emailDate: string
  storagePath: string
  roomId: string | null
  roomName: string | null
}

export interface AssetGroup {
  fileType: AssetFileType
  label: string
  assets: WorkspaceAsset[]
}

function classifyFileType(mimeType: string | null, filename: string): AssetFileType {
  const mime = mimeType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['xlsx', 'xls', 'csv', 'numbers'].includes(ext)
  )
    return 'spreadsheet'

  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'tiff', 'bmp'].includes(ext)
  )
    return 'image'

  if (
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('text/') ||
    ['doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'pptx', 'ppt', 'key'].includes(ext)
  )
    return 'document'

  return 'other'
}

const FILE_TYPE_ORDER: AssetFileType[] = ['pdf', 'spreadsheet', 'document', 'image', 'other']
const FILE_TYPE_LABELS: Record<AssetFileType, string> = {
  pdf: 'PDFs',
  spreadsheet: 'Spreadsheets',
  document: 'Documents',
  image: 'Images',
  other: 'Other',
}

export async function getWorkspaceAssetsGrouped(workspaceId: string): Promise<AssetGroup[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assets')
    .select('id, filename, likely_type, mime_type, size_bytes, created_at, storage_path, email_id, emails(received_at, room_emails(rooms(id, name)))')
    .eq('workspace_id', workspaceId)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const grouped = new Map<AssetFileType, WorkspaceAsset[]>()
  for (const ft of FILE_TYPE_ORDER) grouped.set(ft, [])

  for (const row of data) {
    const emailJoin = row.emails as {
      received_at: string
      room_emails: Array<{ rooms: { id: string; name: string } | null }>
    } | null

    if (!emailJoin || !row.storage_path) continue

    // Take the first room this email belongs to
    const firstRoom = emailJoin.room_emails?.[0]?.rooms ?? null

    const fileType = classifyFileType(row.mime_type, row.filename)

    grouped.get(fileType)!.push({
      id: row.id,
      filename: row.filename,
      likelyType: row.likely_type,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      fileType,
      createdAt: row.created_at,
      emailDate: emailJoin.received_at,
      storagePath: row.storage_path,
      roomId: firstRoom?.id ?? null,
      roomName: firstRoom?.name ?? null,
    })
  }

  // Return only groups that have assets, in defined order
  return FILE_TYPE_ORDER
    .filter((ft) => (grouped.get(ft)?.length ?? 0) > 0)
    .map((ft) => ({
      fileType: ft,
      label: FILE_TYPE_LABELS[ft],
      assets: grouped.get(ft)!,
    }))
}
