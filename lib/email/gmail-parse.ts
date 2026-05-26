import type { AttachmentMeta } from '@/lib/types/database'

interface GmailPart {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPart[]
  headers?: Array<{ name: string; value: string }>
}

// Filenames that are mail client internals rather than user documents.
const NOISE_FILENAMES = new Set(['smime.p7s', 'smime.p7m', 'noname', 'winmail.dat', ''])

export function extractAttachments(
  payload: {
    mimeType?: string
    filename?: string
    body?: { data?: string; attachmentId?: string; size?: number }
    parts?: GmailPart[]
    headers?: Array<{ name: string; value: string }>
  } | null
): AttachmentMeta[] {
  if (!payload) return []

  const results: AttachmentMeta[] = []

  // A part is a user-facing attachment if it has a non-noise filename, a
  // body.attachmentId, and a Content-Disposition of attachment (not inline).
  if (payload.filename && payload.body?.attachmentId) {
    const fn = payload.filename.trim()
    const disposition =
      payload.headers
        ?.find((h) => h.name.toLowerCase() === 'content-disposition')
        ?.value?.toLowerCase() ?? ''
    const isInline = disposition.startsWith('inline')

    if (!NOISE_FILENAMES.has(fn.toLowerCase()) && !isInline) {
      results.push({
        filename: fn,
        mime_type: payload.mimeType ?? 'application/octet-stream',
        size: payload.body.size ?? 0,
        gmail_attachment_id: payload.body.attachmentId,
      })
    }
  }

  for (const part of payload.parts ?? []) {
    results.push(...extractAttachments(part))
  }

  return results
}

export function extractPlainText(
  payload: { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] } | null
): string | null {
  if (!payload) return null

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPlainText(part)
      if (result) return result
    }
  }

  return null
}
