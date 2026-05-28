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

// Strips HTML tags and decodes common entities to produce readable plain text.
// Used as a fallback when an email has no text/plain part (e.g. mobile clients).
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractByMimeType(
  payload: { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] } | null,
  mimeType: string,
): string | null {
  if (!payload) return null

  if (payload.mimeType === mimeType && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractByMimeType(part, mimeType)
      if (result) return result
    }
  }

  return null
}

export function extractPlainText(
  payload: { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] } | null
): string | null {
  // Prefer text/plain — clean, no markup.
  const plain = extractByMimeType(payload, 'text/plain')
  if (plain) return plain

  // Fall back to text/html when no plain text part exists.
  // Mobile clients (iOS Mail, Gmail app) often send HTML-only replies.
  const html = extractByMimeType(payload, 'text/html')
  if (html) return stripHtml(html) || null

  return null
}
