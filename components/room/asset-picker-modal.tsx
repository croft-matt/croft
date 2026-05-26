'use client'

import { FileText, FileSpreadsheet, FileImage, File, FileCode, X, Check, Loader2 } from 'lucide-react'
import type { AssetGroup, WorkspaceAsset, AssetFileType } from '@/lib/queries/assets'
import { cn } from '@/lib/utils'

function formatFileSize(bytes: number | null): string | null {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ fileType }: { fileType: AssetFileType }) {
  const cls = 'h-5 w-5 text-muted-foreground'
  switch (fileType) {
    case 'pdf':         return <FileText className={cls} />
    case 'spreadsheet': return <FileSpreadsheet className={cls} />
    case 'image':       return <FileImage className={cls} />
    case 'document':    return <FileCode className={cls} />
    default:            return <File className={cls} />
  }
}

interface AssetPickerCardProps {
  asset: WorkspaceAsset
  selected: boolean
  onToggle: () => void
}

function AssetPickerCard({ asset, selected, onToggle }: AssetPickerCardProps) {
  const fileSize = formatFileSize(asset.sizeBytes)

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex flex-col gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
        selected
          ? 'border-foreground/30 bg-foreground/8'
          : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="shrink-0 mt-0.5">
            <FileIcon fileType={asset.fileType} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
              {asset.filename}
            </p>
            {asset.likelyType && (
              <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                {asset.likelyType.replace(/_/g, ' ')}
              </p>
            )}
          </div>
        </div>
        {selected && (
          <div className="shrink-0 h-4 w-4 rounded-full bg-foreground flex items-center justify-center mt-0.5">
            <Check className="h-2.5 w-2.5 text-background" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        {asset.roomName ? (
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground truncate">
            {asset.roomName}
          </span>
        ) : (
          <span />
        )}
        {fileSize && (
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {fileSize}
          </span>
        )}
      </div>
    </button>
  )
}

interface AssetPickerModalProps {
  groups: AssetGroup[]
  loading: boolean
  selectedIds: string[]
  onToggle: (id: string) => void
  onClose: () => void
}

export function AssetPickerModal({
  groups,
  loading,
  selectedIds,
  onToggle,
  onClose,
}: AssetPickerModalProps) {
  const total = groups.reduce((sum, g) => sum + g.assets.length, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div className="relative bg-background rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
            {!loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {total} {total === 1 ? 'file' : 'files'} across your workspace
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No assets yet.</p>
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <section key={group.fileType}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-foreground">{group.label}</h3>
                    <span className="text-xs text-muted-foreground">{group.assets.length}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {group.assets.map((asset) => (
                      <AssetPickerCard
                        key={asset.id}
                        asset={asset}
                        selected={selectedIds.includes(asset.id)}
                        onToggle={() => onToggle(asset.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-foreground py-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-80"
          >
            {selectedIds.length > 0
              ? `Done — ${selectedIds.length} ${selectedIds.length === 1 ? 'file' : 'files'} selected`
              : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
