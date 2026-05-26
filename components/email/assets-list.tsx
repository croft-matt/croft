'use client'

import { useState } from 'react'
import type { Asset } from '@/lib/types/database'
import { FileText, FileSpreadsheet, Link as LinkIcon, File } from 'lucide-react'
import { AssetViewerModal } from '@/components/assets/asset-viewer-modal'

interface AssetsListProps {
  assets: Asset[]
}

interface ViewingAsset {
  id: string
  filename: string
  mimeType: string | null
}

function getFileIcon(mimeType: string | null, filename: string) {
  const mime = mimeType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (mime.includes('pdf') || ext === 'pdf') {
    return <FileText className="h-5 w-5 text-muted-foreground" />
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ['xlsx', 'xls', 'csv'].includes(ext)
  ) {
    return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
  }
  if (mime.includes('html') || ext === 'html') {
    return <LinkIcon className="h-5 w-5 text-muted-foreground" />
  }
  return <File className="h-5 w-5 text-muted-foreground" />
}

export function AssetsList({ assets }: AssetsListProps) {
  const [viewingAsset, setViewingAsset] = useState<ViewingAsset | null>(null)

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Assets
        </p>
        <div className="flex flex-col gap-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5"
            >
              <div className="shrink-0">{getFileIcon(asset.mime_type, asset.filename)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{asset.filename}</p>
                  {asset.likely_type && (
                    <p className="text-xs text-muted-foreground mt-0.5">{asset.likely_type}</p>
                  )}
              </div>
              <div className="shrink-0">
                {asset.storage_path ? (
                  <button
                    onClick={() => setViewingAsset({
                      id: asset.id,
                      filename: asset.filename,
                      mimeType: asset.mime_type ?? null,
                    })}
                    className="text-xs font-medium text-foreground hover:text-muted-foreground transition-colors"
                  >
                    View
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">Not attached</span>
                )}
              </div>
            </div>
          ))}
        </div>
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
