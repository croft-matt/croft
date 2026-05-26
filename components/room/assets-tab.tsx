'use client'

import { useState } from 'react'
import { FileText, FileSpreadsheet, FileImage, File } from 'lucide-react'
import type { RoomAssets, RoomAsset } from '@/lib/rooms/assets'
import { EmailCitation } from '@/components/room/email-citation'
import { AssetViewerModal } from '@/components/assets/asset-viewer-modal'

interface AssetsTabProps {
  assets: RoomAssets
}

interface ViewingAsset {
  id: string
  filename: string
  mimeType: string | null
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

function AssetRow({ asset, onOpen }: { asset: RoomAsset; onOpen: (a: ViewingAsset) => void }) {
  const fileSize = formatFileSize(asset.size_bytes)
  const senderLabel = asset.from_name ?? 'Unknown'

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="pt-0.5">{getFileIcon(asset.mime_type, asset.filename)}</div>

      <div className="min-w-0 flex-1">
        <button
          onClick={() => onOpen({ id: asset.id, filename: asset.filename, mimeType: asset.mime_type ?? null })}
          className="text-sm font-medium text-foreground hover:text-muted-foreground transition-colors truncate block text-left w-full"
        >
          {asset.filename}
        </button>

        <p className="text-xs text-muted-foreground mt-0.5">
          From {senderLabel}, {formatDate(asset.email_date)}
          {fileSize && <span className="ml-2 text-muted-foreground/60">{fileSize}</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {asset.likely_type && (
          <span className="rounded px-1.5 py-0.5 text-[13px] font-medium bg-muted text-muted-foreground">
            {asset.likely_type}
          </span>
        )}

        <EmailCitation emailId={asset.email_id} />
      </div>
    </div>
  )
}

function StatusGroup({
  status,
  items,
  onOpen,
}: {
  status: RoomAsset['status']
  items: RoomAsset[]
  onOpen: (a: ViewingAsset) => void
}) {
  if (items.length === 0) return null

  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
        {STATUS_LABELS[status]} ({items.length})
      </p>
      <div className="space-y-2">
        {items.map((asset) => (
          <AssetRow key={asset.id} asset={asset} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

export function AssetsTab({ assets }: AssetsTabProps) {
  const [viewingAsset, setViewingAsset] = useState<ViewingAsset | null>(null)

  if (assets.total === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        No files have been received in this room.
      </div>
    )
  }

  return (
    <>
      <div>
        {STATUS_ORDER.map((status) => (
          <StatusGroup
            key={status}
            status={status}
            items={assets[status]}
            onOpen={setViewingAsset}
          />
        ))}
      </div>

      {viewingAsset && (
        <AssetViewerModal
          assetId={viewingAsset.id}
          filename={viewingAsset.filename}
          mimeType={viewingAsset.mimeType}
          onClose={() => setViewingAsset(null)}
        />
      )}
    </>
  )
}
