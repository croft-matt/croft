'use client'

import { useState } from 'react'
import { FileText, FileSpreadsheet, File } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Asset } from '@/lib/types/database'
import { getAssetUrl } from '@/lib/storage'

interface AssetsTabProps {
  assets: Asset[]
}

function getFileIcon(mimeType: string | null, filename: string) {
  const mime = mimeType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (mime.includes('pdf') || ext === 'pdf') return <FileText className="h-5 w-5 text-muted-foreground" />
  if (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
  }
  return <File className="h-5 w-5 text-muted-foreground" />
}

export function AssetsTab({ assets }: AssetsTabProps) {
  const types = [...new Set(assets.map((a) => a.likely_type).filter(Boolean))] as string[]
  const [activeType, setActiveType] = useState<string | null>(null)

  const filtered = activeType ? assets.filter((a) => a.likely_type === activeType) : assets

  if (assets.length === 0) {
    return (
      <div className="px-6 py-8 text-sm text-muted-foreground">No assets in this room yet.</div>
    )
  }

  return (
    <div className="px-6 py-4">
      {types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
            <button
            onClick={() => setActiveType(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              !activeType ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t === activeType ? null : t)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeType === t ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
      </p>

      <div className="space-y-2">
        {filtered.map((asset) => (
          <div key={asset.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <div className="shrink-0">{getFileIcon(asset.mime_type, asset.filename)}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{asset.filename}</p>
              {asset.likely_type && (
                <p className="text-xs text-muted-foreground mt-0.5">{asset.likely_type}</p>
              )}
            </div>
            <div className="shrink-0">
              {asset.storage_path ? (
                <a
                  href={getAssetUrl(asset.storage_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-foreground hover:text-muted-foreground transition-colors"
                >
                  View
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Not attached</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
