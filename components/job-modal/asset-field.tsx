'use client'

import { useRef } from 'react'
import { Paperclip, X } from 'lucide-react'

interface AssetFieldProps {
  file: File | null
  onChange: (file: File | null) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetField({ file, onChange }: AssetFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1.5">Attachment (optional)</label>
      {file ? (
        <div className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2">
          <Paperclip className="h-4 w-4 text-neutral-500 shrink-0" />
          <span className="flex-1 truncate text-sm text-white">{file.name}</span>
          <span className="text-xs text-neutral-500">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-md border border-dashed border-neutral-700 bg-transparent px-3 py-2 text-sm text-neutral-500 hover:border-neutral-600 hover:text-neutral-400 transition-colors w-full"
        >
          <Paperclip className="h-4 w-4" />
          Attach a file
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0]
          onChange(selected ?? null)
          e.target.value = ''
        }}
      />
    </div>
  )
}
