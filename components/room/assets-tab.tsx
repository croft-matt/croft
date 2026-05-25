'use client'

import { FileText, FileSpreadsheet, FileImage, File, Download } from 'lucide-react'
import type { RoomAssets, RoomAsset } from '@/lib/rooms/assets'
import { EmailCitation } from '@/components/room/email-citation'

interface AssetsTabProps {
  assets: RoomAssets
}

const STATUS_LABELS: Record<RoomAsset['status'], string> = {
  received: 'Received',
  sent: 'Sent',
  submitted: 'Submitted',
  accepted: 'Accepted',
  not_reviewed: 'Not reviewed',
}

const STATUS_ORDER: RoomAsset['status'][] = [
  'received',
  'sent',
  'submitted',
  'accepted',
  'not_reviewed',
]

function getFileIcon(mimeType: string | null, filename: string) {
  const mime = mimeType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (mime.includes('pdf') || ext === 'pdf')
    return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ['xlsx', 'xls', 'csv'].includes(ext)
  )
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function AssetRow({ asset }: { asset: RoomAsset }) {
  const downloadHref = `/api/assets/${asset.id}/url`
  const fileSize = formatFileSize(asset.size_bytes)
  const senderLabel = asset.from_name ?? 'Unknown'

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="pt-0.5">{getFileIcon(asset.mime_type, asset.filename)}</div>

      <div className="min-w-0 flex-1">
        <a
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:text-muted-foreground transition-colors truncate block"
        >
          {asset.filename}
        </a>

        <p className="text-xs text-muted-foreground mt-0.5">
          From {senderLabel}, {formatDate(asset.email_date)}
          {fileSize && <span className="ml-2 text-muted-foreground/60">{fileSize}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {asset.likely_type && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            {asset.likely_type}
          </span>
        )}

        <a
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={`Download ${asset.filename}`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>

        <EmailCitation emailId={asset.email_id} />
      </div>
    </div>
  )
}

function StatusGroup({ status, items }: { status: RoomAsset['status']; items: RoomAsset[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {STATUS_LABELS[status]} ({items.length})
      </p>
      <div className="space-y-2">
        {items.map((asset) => (
          <AssetRow key={asset.id} asset={asset} />
        ))}
      </div>
    </div>
  )
}

export function AssetsTab({ assets }: AssetsTabProps) {
  if (assets.total === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        No files have been received in this room.
      </div>
    )
  }

  return (
    <div>
      {STATUS_ORDER.map((status) => (
        <StatusGroup key={status} status={status} items={assets[status]} />
      ))}
    </div>
  )
}
