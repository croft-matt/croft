import { NextResponse, type NextRequest } from 'next/server'
import { Resend } from 'resend'
import type { WebhookEventPayload } from 'resend'
import { storeEmailMetadata } from '@/lib/email/ingest'
import { ResendInboundEventSchema } from '@/lib/validators/email-inbound'
import { fetchBodyTask } from '@/trigger/jobs/fetch-body'
import { confirmGmailForwardingTask } from '@/trigger/jobs/confirm-gmail-forwarding'
import { inboundRatelimit } from '@/lib/ratelimit'

// This handler does three things:
// 1. Verify the Resend webhook signature
// 2. Store the raw email metadata to the emails table
// 3. Return 200
//
// Gmail forwarding verification emails (from forwarding-noreply@google.com) are detected
// before the normal path and routed to confirm-gmail-forwarding instead of fetch-body.
// All other email processing is async via Trigger.dev jobs.
// Resend retries on non-200 — a slow handler causes duplicate emails.

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { success } = await inboundRatelimit.limit(ip)
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const rawBody = await request.text()

  let event: WebhookEventPayload
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
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

  const fromAddress = (parsed.data.data.from as string).toLowerCase()
  if (fromAddress.includes('forwarding-noreply@google.com')) {
    try {
      const result = await storeEmailMetadata(parsed.data.data)
      if (result) {
        await confirmGmailForwardingTask.trigger({
          emailId: result.emailId,
          workspaceId: result.workspaceId,
          resendEmailId: parsed.data.data.email_id,
        })
      }
    } catch (err) {
      console.error('[inbound] failed to handle Gmail verification email:', err)
    }
    return NextResponse.json({ ok: true })
  }

  try {
    const result = await storeEmailMetadata(parsed.data.data)

    if (result) {
      await fetchBodyTask.trigger({ emailId: result.emailId })
    }
  } catch (err) {
    console.error('[inbound] failed to store email:', err)
    // Return 200 anyway — returning a non-200 causes Resend to retry and duplicate.
  }

  return NextResponse.json({ ok: true })
}
