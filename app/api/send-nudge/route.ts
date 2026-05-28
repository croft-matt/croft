import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { sendRatelimit } from '@/lib/ratelimit'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendNudgeRequest {
  to: string
  subject: string
  body: string
  roomId: string
  workspaceId: string
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser()
  const body = (await request.json()) as SendNudgeRequest
  const { to, subject, body: emailBody, roomId, workspaceId } = body

  if (!to || !subject || !emailBody || !roomId || !workspaceId) {
    return NextResponse.json({ error: 'to, subject, body, roomId, and workspaceId are required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify workspace membership.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { success: sendAllowed } = await sendRatelimit.limit(workspaceId)
  if (!sendAllowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Fetch workspace Croft address and user reply-to address.
  const [workspaceResult, accountResult] = await Promise.all([
    supabase
      .from('workspaces')
      .select('croft_email_address')
      .eq('id', workspaceId)
      .single(),
    supabase
      .from('email_accounts')
      .select('email_address')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .limit(1)
      .single(),
  ])

  const croftAddress = workspaceResult.data?.croft_email_address
  if (!croftAddress) {
    return NextResponse.json({ error: 'Workspace has no Croft email address configured' }, { status: 400 })
  }

  const replyTo = accountResult.data?.email_address ?? user.email ?? croftAddress

  // Send via Resend.
  const { error: sendError } = await resend.emails.send({
    from: croftAddress,
    to: [to],
    replyTo,
    subject,
    text: emailBody,
  })

  if (sendError) {
    console.error('[send-nudge] Resend error:', sendError.message)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }

  // Generate a unique message_id for this outbound nudge.
  const messageId = `nudge-${crypto.randomUUID()}@mail.yourcroft.com`

  // Store a record in emails so it appears in history.
  const { data: emailRow } = await supabase
    .from('emails')
    .insert({
      workspace_id: workspaceId,
      message_id: messageId,
      from_address: croftAddress,
      to_addresses: [to],
      subject,
      body_text: emailBody,
      source: 'user_nudge',
      processing_state: 'ignored',
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  // Link the email to the room so it shows in room history.
  if (emailRow?.id) {
    await supabase
      .from('room_emails')
      .insert({ room_id: roomId, email_id: emailRow.id, source: 'user_nudge' })
      .then(() => void 0)
  }

  return NextResponse.json({ ok: true })
}
