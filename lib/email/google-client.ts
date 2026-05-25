import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken, decryptToken } from '@/lib/crypto/tokens'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// Returns a valid plaintext access token for the given email_accounts row.
// Refreshes automatically if the token expires within 5 minutes.
// Throws if the account is not found, tokens are revoked, or refresh fails.
export async function getValidAccessToken(accountId: string): Promise<string> {
  const supabase = createAdminClient()

  const { data: account, error } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (error || !account) {
    throw new Error(`getValidAccessToken: account ${accountId} not found`)
  }

  if (!account.access_token_encrypted || !account.refresh_token_encrypted) {
    throw new Error(`getValidAccessToken: account ${accountId} tokens are revoked — reconnection required`)
  }

  const expiresAt = new Date(account.token_expires_at).getTime()

  if (expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return decryptToken(account.access_token_encrypted)
  }

  // Token is stale — attempt refresh
  const refreshToken = decryptToken(account.refresh_token_encrypted)

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    // Only revoke on a definitive invalid_grant response. Google returns this
    // when the refresh token has been explicitly revoked by the user or expired
    // due to inactivity. For 5xx errors and network failures, throwing without
    // revoking lets Trigger.dev's retry policy recover without disconnecting
    // a still-valid mailbox.
    let errorCode: string | null = null
    try {
      const body = (await response.json()) as { error?: string }
      errorCode = body.error ?? null
    } catch {
      // Non-JSON body (e.g. 5xx HTML error page) — treat as transient.
    }

    if (errorCode === 'invalid_grant') {
      await revokeAndBroadcast(accountId, account.workspace_id)
      throw new Error(`getValidAccessToken: refresh token revoked for account ${accountId} — reconnection required`)
    }

    throw new Error(`getValidAccessToken: token refresh failed for account ${accountId} (${response.status} ${errorCode ?? 'unknown'}) — will retry`)
  }

  const tokens = (await response.json()) as { access_token: string; expires_in: number }
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('email_accounts')
    .update({
      access_token_encrypted: encryptToken(tokens.access_token),
      token_expires_at: newExpiresAt,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', accountId)

  return tokens.access_token
}

async function revokeAndBroadcast(accountId: string, workspaceId: string): Promise<void> {
  const supabase = createAdminClient()

  await supabase
    .from('email_accounts')
    .update({ access_token_encrypted: null, refresh_token_encrypted: null })
    .eq('id', accountId)

  const channel = supabase.channel(`workspace:${workspaceId}`)
  await channel.send({
    type: 'broadcast',
    event: 'gmail:reconnect-required',
    payload: { accountId },
  })
  await supabase.removeChannel(channel)
}
