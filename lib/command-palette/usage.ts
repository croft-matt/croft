import { createClient } from '@/lib/supabase/server'

interface UsageEvent {
  workspaceId: string
  userId: string
  eventType: 'ask' | 'nudge'
  modelUsed: string
  inputTokens?: number
  outputTokens?: number
  roomId?: string
}

export async function logAiUsage(event: UsageEvent): Promise<void> {
  try {
    const supabase = await createClient()
    // ai_usage_events is not yet in the generated types -- cast until types:gen runs post-migration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('ai_usage_events').insert({
      workspace_id: event.workspaceId,
      user_id: event.userId,
      event_type: event.eventType,
      model_used: event.modelUsed,
      input_tokens: event.inputTokens ?? null,
      output_tokens: event.outputTokens ?? null,
      room_id: event.roomId ?? null,
    })
  } catch {
    // Logging must never break the primary flow.
  }
}
