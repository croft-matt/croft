import type { Asset } from '@/lib/types/database'
import { FileText, FileSpreadsheet, Link as LinkIcon, File } from 'lucide-react'
import { getAssetUrl } from '@/lib/storage'

interface AssetsListProps {
  assets: Asset[]
}

function getFileIcon(mimeType: string | null, filename: string) {
  const mime = mimeType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (mime.includes('pdf') || ext === 'pdf') {
    return <FileText className="h-5 w-5 text-neutral-400" />
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ['xlsx', 'xls', 'csv'].includes(ext)
  ) {
    return <FileSpreadsheet className="h-5 w-5 text-neutral-400" />
  }
  if (mime.includes('html') || ext === 'html') {
    return <LinkIcon className="h-5 w-5 text-neutral-400" />
  }
  return <File className="h-5 w-5 text-neutral-400" />
}

export function AssetsList({ assets }: AssetsListProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Assets
      </p>
      <div className="flex flex-col gap-2">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-3 rounded-lg bg-neutral-800 px-3 py-2.5"
          >
            <div className="shrink-0">{getFileIcon(asset.mime_type, asset.filename)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-100">{asset.filename}</p>
              {asset.likely_type && (
                <p className="text-xs text-neutral-500 mt-0.5">{asset.likely_type}</p>
              )}
            </div>
            <div className="shrink-0">
              {asset.storage_path ? (
                <a
                  href={getAssetUrl(asset.storage_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-neutral-300 hover:text-white transition-colors"
                >
                  View
                </a>
              ) : (
                <span className="text-xs text-neutral-600">Not attached</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
