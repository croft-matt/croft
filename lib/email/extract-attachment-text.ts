// Pure text extraction from attachment bytes.
// Takes a Buffer and mime_type, returns extracted plain text or null.
// Supports PDF, DOCX, and plain text. All other types return null gracefully.
// This function is synchronous-friendly and non-fatal — never throws.

// Supported mime types:
//   PDF:  application/pdf
//   DOCX: application/vnd.openxmlformats-officedocument.wordprocessingml.document
//         application/msword (legacy .doc — not supported, returns null)
//   Text: text/plain, text/csv, text/html

export async function extractAttachmentText(
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  const type = mimeType.toLowerCase().split(';')[0].trim()

  try {
    // PDF — uses unpdf (pdfjs-dist wrapper) which works in Node.js ESM.
    // pdf-parse bundles a webpack build of pdf.js and fails with __require.ensure errors.
    if (type === 'application/pdf') {
      const { extractText } = await import('unpdf')
      const { text } = await extractText(new Uint8Array(bytes))
      const joined = text.join('\n').trim()
      return joined || null
    }

    // DOCX
    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.toLowerCase().endsWith('.docx')
    ) {
      const { default: mammoth } = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: bytes })
      const text = result.value?.trim()
      return text || null
    }

    // Plain text, CSV, simple HTML
    if (type.startsWith('text/')) {
      const text = bytes.toString('utf-8').trim()
      return text || null
    }

    // Unsupported type — return null, not an error
    return null
  } catch (err) {
    // Extraction failure is non-fatal — log and return null so classification proceeds
    console.error(`extractAttachmentText: failed to extract text from ${filename} (${mimeType}):`, err)
    return null
  }
}
