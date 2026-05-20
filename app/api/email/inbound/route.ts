import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import type { WebhookEventPayload } from 'resend'
import { storeEmailMetadata } from '@/lib/email/ingest'
import { ResendInboundEventSchema } from '@/lib/validators/email-inbound'

const resend = new Resend(process.env.RESEND_API_KEY)

// This handler does exactly three things:
// 1. Verify the Resend webhook signature
// 2. Store the raw email metadata to the emails table
// 3. Return 200
//
// No AI. No body fetching. No synchronous processing.
// Body is fetched and processing is triggered by the fetch-body Trigger.dev job (see trigger/jobs/).
// Resend retries on non-200 — a slow handler causes duplicate emails.

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  let event: WebhookEventPayload
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: request.headers,
      webhookSecret: process.env.RESEND_INBOUND_WEBHOOK_SECRET!,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (event.type !== 'email.received') {
    return NextResponse.json({ ok: true })
  }

  const parsed = ResendInboundEventSchema.safeParse(event)
  if (!parsed.success) {
    console.error('[inbound] unexpected payload shape:', parsed.error.flatten())
    return NextResponse.json({ ok: true })
  }

  try {
    const result = await storeEmailMetadata(parsed.data.data)

    if (result) {
      // Trigger.dev fetch-body job wired in Commit 6.
      // The job fetches the full body from Resend, then enqueues Tier 1.
      console.info('[inbound] email stored, pending fetch-body job:', result.emailId)
    }
  } catch (err) {
    console.error('[inbound] failed to store email:', err)
    // Return 200 anyway — returning a non-200 causes Resend to retry and duplicate.
  }

  return NextResponse.json({ ok: true })
}
