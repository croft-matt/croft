import { NextResponse, type NextRequest } from 'next/server'
import Stripe from 'stripe'

// Stripe webhook handler.
// Full billing logic will be implemented in the billing brief.
export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Billing event handling will be added in the billing brief.
  console.info('[stripe] received event:', event.type)

  return NextResponse.json({ received: true })
}
