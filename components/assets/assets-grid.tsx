'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, FileSpreadsheet, FileImage, File, FileCode } from 'lucide-react'
import type { WorkspaceAsset, AssetGroup, AssetFileType } from '@/lib/queries/assets'
import { AssetViewerModal } from '@/components/assets/asset-viewer-modal'

interface ViewingAsset {
  id: string
  filename: string
  mimeType: string | null
}

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ fileType, className }: { fileType: AssetFileType; className?: string }) {
  const cls = className ?? 'h-8 w-8 text-muted-foreground'
  switch (fileType) {
    case 'pdf':        return <FileText className={cls} />
    case 'spreadsheet': return <FileSpreadsheet className={cls} />
    case 'image':      return <FileImage className={cls} />
    case 'document':   return <FileCode className={cls} />
    default:           return <File className={cls} />
  }
}

function AssetCard({ asset, onOpen }: { asset: WorkspaceAsset; onOpen: (a: ViewingAsset) => void }) {
  const fileSize = formatFileSize(asset.sizeBytes)

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 hover:bg-muted/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <FileIcon fileType={asset.fileType} />
        </div>
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onOpen({ id: asset.id, filename: asset.filename, mimeType: asset.mimeType ?? null })}
            className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors break-words leading-tight line-clamp-2 block text-left w-full"
          >
            {asset.filename}
          </button>
          {asset.likelyType && (
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {asset.likelyType.replace(/_/g, ' ')}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex items-center justify-between gap-2">
        {asset.roomId && asset.roomName ? (
          <Link
            href={`/rooms/${asset.roomId}`}
            className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors truncate"
          >
            {asset.roomName}
          </Link>
        ) : (
          <span />
        )}
        {fileSize && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {fileSize}
          </span>
        )}
      </div>
    </div>
  )
}

interface AssetsGridProps {
  groups: AssetGroup[]
  total: number
}

export function AssetsGrid({ groups, total }: AssetsGridProps) {
  const [viewingAsset, setViewingAsset] = useState<ViewingAsset | null>(null)

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No assets yet — they appear once emails with attachments come in.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.fileType}>
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              <span className="text-xs text-muted-foreground">{group.assets.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {group.assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onOpen={setViewingAsset} />
              ))}
            </div>
          </section>
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
