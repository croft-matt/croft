import { NextResponse, type NextRequest } from 'next/server'
import { tasks } from '@trigger.dev/sdk/v3'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto/tokens'
import { redis } from '@/lib/ratelimit'

function createRouteClient(request: NextRequest) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() { /* read-only — session writes handled by middleware */ },
      },
    }
  )
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const settingsUrl = `${origin}/settings/email`

  const errorParam = searchParams.get('error')
  if (errorParam) {
    return NextResponse.redirect(`${settingsUrl}?error=${errorParam}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?error=missing_params`)
  }

  // Confirm the user is still authenticated.
  const supabase = createRouteClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`)
  }

  // Retrieve and immediately delete the PKCE state to prevent replay.
  const stored = await redis.get<string>(`gmail:pkce:${state}`)
  await redis.del(`gmail:pkce:${state}`)

  if (!stored) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_state`)
  }

  const { verifier, workspaceId, userId } = JSON.parse(stored) as {
    verifier: string
    workspaceId: string
    userId: string
  }

  // Exchange the authorisation code for tokens.
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/gmail/callback`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    console.error('[gmail/callback] token exchange failed:', body)
    return NextResponse.redirect(`${settingsUrl}?error=token_exchange_failed`)
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }

  // Fetch the Gmail address associated with these tokens.
  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!profileResponse.ok) {
    return NextResponse.redirect(`${settingsUrl}?error=profile_fetch_failed`)
  }

  const profile = (await profileResponse.json()) as { email: string }
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const scopes = tokens.scope.split(' ')

  const adminSupabase = createAdminClient()

  const { data: account, error: upsertError } = await adminSupabase
    .from('email_accounts')
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        provider: 'google' as const,
        email_address: profile.email,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: expiresAt,
        scopes,
        forwarding_configured: false,
        history_imported: false,
      },
      { onConflict: 'workspace_id,email_address' }
    )
    .select('id')
    .single()

  if (upsertError || !account) {
    console.error('[gmail/callback] upsert failed:', upsertError)
    return NextResponse.redirect(`${settingsUrl}?error=account_save_failed`)
  }

  // Enqueue the forwarding setup job. Uses string ID to avoid importing the
  // task file directly — allows this commit to be independent of the jobs commit.
  await tasks.trigger('configure-gmail-forwarding', { accountId: account.id })

  return NextResponse.redirect(`${settingsUrl}?connected=1`)
}
