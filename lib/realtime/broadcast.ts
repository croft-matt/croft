// Broadcasts an event to a workspace channel via the Supabase Realtime HTTP API.
// Using HTTP rather than a WebSocket client because server-side WebSocket broadcast
// (supabase-js channel.send) was unreliable from Trigger.dev cloud workers.
// The HTTP endpoint accepts service-role auth and does not require a persistent connection.
export async function broadcastToWorkspace(
  workspaceId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`

  const body = JSON.stringify({
    messages: [
      {
        topic: `workspace:${workspaceId}`,
        event,
        payload,
      },
    ],
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[broadcast] failed to send "${event}" to workspace:${workspaceId} (${res.status}): ${text}`)
  }
}
