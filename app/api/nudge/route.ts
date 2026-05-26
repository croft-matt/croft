import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from '@/lib/command-palette/usage'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface NudgeItem {
  description: string
  silenceDays: number
  dueDate?: string
}

interface NudgeRequest {
  personName: string
  personEmail: string
  items: NudgeItem[]
  roomName: string
  workspaceId: string
}

interface NudgeResponse {
  subject: string
  body: string
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await requireUser()
  const body = (await request.json()) as NudgeRequest
  const { personName, personEmail, items, roomName, workspaceId } = body

  if (!personEmail || !items?.length || !workspaceId) {
    return NextResponse.json({ error: 'personEmail, items, and workspaceId are required' }, { status: 400 })
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

  // Resolve sender name from user metadata, falling back to email local part.
  const senderName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email?.split('@')[0] ?? 'Your colleague')

  const itemLines = items.map(item => {
    const silence = `${item.silenceDays} day${item.silenceDays === 1 ? '' : 's'} since last contact`
    const due = item.dueDate ? `, due ${item.dueDate}` : ''
    return `- ${item.description} (${silence}${due})`
  }).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: `You write polite, professional follow-up emails on behalf of a project manager.
The emails are specific, warm, and never passive-aggressive.
You must reference the actual outstanding items by name.
Do not write a generic "just checking in" email.
Do not use em-dashes.
Do not open with "I hope this email finds you well" or similar filler.
Return JSON with exactly two keys: "subject" and "body".
The body should be plain text, 3-5 sentences maximum.`,
    messages: [
      {
        role: 'user',
        content: `Write a follow-up email to ${personName} (${personEmail}) about the following outstanding items from the project "${roomName}":

${itemLines}

The email is from ${senderName}.`,
      },
    ],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: NudgeResponse
  try {
    // Strip markdown code fences if the model wraps output.
    const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    parsed = JSON.parse(cleaned) as NudgeResponse
  } catch {
    // Fallback: extract subject/body heuristically.
    const lines = rawText.split('\n').filter(Boolean)
    parsed = {
      subject: lines[0]?.replace(/^subject:\s*/i, '') ?? `Following up: ${roomName}`,
      body: lines.slice(1).join('\n').replace(/^body:\s*/i, '').trim() || rawText,
    }
  }

  try {
    await logAiUsage({
      workspaceId,
      userId: user.id,
      eventType: 'nudge',
      modelUsed: 'claude-sonnet-4-6',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })
  } catch {
    // Logging failure must not fail the response.
  }

  return NextResponse.json(parsed)
}
