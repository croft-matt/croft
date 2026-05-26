'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'


export interface AssetViewerModalProps {
  assetId: string | null
  filename: string
  mimeType: string | null
  onClose: () => void
}

type ViewerType = 'image' | 'pdf' | 'download'

function getViewerType(mimeType: string | null): ViewerType {
  if (!mimeType) return 'download'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf' || mimeType.includes('pdf')) return 'pdf'
  return 'download'
}

export function AssetViewerModal({ assetId, filename, mimeType, onClose }: AssetViewerModalProps) {
  const viewerType = getViewerType(mimeType)
  const contentUrl = assetId ? `/api/assets/${assetId}/content` : null
  const downloadUrl = assetId ? `/api/assets/${assetId}/content?download=true` : null

  return (
    <Dialog open={assetId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[92vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm font-medium truncate">{filename}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex items-start justify-center bg-muted/30">
          {contentUrl && viewerType === 'image' && (
            <img
              src={contentUrl}
              alt={filename}
              className="max-w-full object-contain p-4"
            />
          )}

          {contentUrl && viewerType === 'pdf' && (
            <iframe
              src={contentUrl}
              title={filename}
              className="w-full h-full border-0"
            />
          )}

          {viewerType === 'download' && downloadUrl && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <p className="text-sm">This file type cannot be previewed.</p>
              <a href={downloadUrl}>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download {filename}
                </Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
