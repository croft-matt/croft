'use client'

import Link from 'next/link'
import { FileIcon, DownloadIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocumentsData } from '@/lib/blocks/documents'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ')
  const className = cn(
    'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
    status === 'accepted' && 'bg-green-500/10 text-green-400',
    status === 'submitted' && 'bg-blue-500/10 text-blue-400',
    status === 'received' && 'bg-neutral-500/10 text-neutral-300',
    status === 'sent' && 'bg-neutral-500/10 text-neutral-400',
    status === 'not_reviewed' && 'bg-amber-500/10 text-amber-400',
  )
  return <span className={className}>{label}</span>
}

interface DocumentsBlockProps {
  data: DocumentsData
}

export function DocumentsBlock({ data }: DocumentsBlockProps) {
  if (data.isEmpty) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
          Documents
        </p>
        <p className="text-sm text-neutral-600">No documents in this room yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
        Documents
      </p>

      <div className="space-y-5">
        {data.groups.map(({ type, items }) => (
          <div key={type}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mb-2">
              {type}
            </p>
            <div className="divide-y divide-neutral-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0"
                >
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-neutral-600" />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-100 truncate">{item.filename}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{formatDate(item.created_at)}</p>
                  </div>

                  <StatusPill status={item.status} />

                  <div className="flex shrink-0 items-center gap-2">
                    {item.storage_path && (
                      <a
                        href={item.storage_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400 transition-colors"
                        aria-label={`Download ${item.filename}`}
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <Link
                      href={`/emails/${item.email_id}`}
                      className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
                    >
                      source
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
