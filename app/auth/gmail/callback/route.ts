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
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const errorParam = searchParams.get('error')
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // We need the PKCE state to know where to redirect on error, so handle
  // missing params before attempting to resolve the redirect destination.
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/settings/email?error=missing_params`)
  }

  // Confirm the user is still authenticated.
  const supabase = createRouteClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`)
  }

  // Retrieve and immediately delete the PKCE state to prevent replay.
  // Upstash Redis automatically deserialises stored JSON, so the value is
  // already a plain object — no JSON.parse needed.
  const stored = await redis.get<{ verifier: string; workspaceId: string; userId: string; redirectTo?: string }>(
    `gmail:pkce:${state}`
  )
  await redis.del(`gmail:pkce:${state}`)

  if (!stored) {
    return NextResponse.redirect(`${origin}/settings/email?error=invalid_state`)
  }

  const { verifier, workspaceId, userId, redirectTo } = stored

  // Resolve the post-OAuth destination based on where the flow originated.
  const successUrl = redirectTo === 'onboarding'
    ? `${origin}/onboarding/setup`
    : `${origin}/settings/email?connected=1`
  const errorUrl = redirectTo === 'onboarding'
    ? `${origin}/onboarding?error=`
    : `${origin}/settings/email?error=`

  if (errorParam) {
    return NextResponse.redirect(`${errorUrl}${errorParam}`)
  }

  if (userId !== user.id) {
    return NextResponse.redirect(`${errorUrl}invalid_state`)
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
    return NextResponse.redirect(`${errorUrl}token_exchange_failed`)
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }

  // Fetch the Gmail address using the Gmail profile endpoint (requires gmail.readonly).
  // We don't request the OpenID email scope, so the generic userinfo endpoint
  // is not available — the Gmail-specific profile endpoint works with our scopes.
  const profileResponse = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!profileResponse.ok) {
    const body = await profileResponse.text()
    console.error('[gmail/callback] profile fetch failed:', profileResponse.status, body)
    return NextResponse.redirect(`${errorUrl}profile_fetch_failed`)
  }

  const profile = (await profileResponse.json()) as { emailAddress: string; historyId?: string }
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
        email_address: profile.emailAddress,
        access_token_encrypted: encryptToken(tokens.access_token),
        refresh_token_encrypted: encryptToken(tokens.refresh_token),
        token_expires_at: expiresAt,
        scopes,
        history_imported: false,
      },
      { onConflict: 'workspace_id,email_address' }
    )
    .select('id')
    .single()

  if (upsertError || !account) {
    console.error('[gmail/callback] upsert failed:', upsertError)
    return NextResponse.redirect(`${errorUrl}account_save_failed`)
  }

  // Store the current historyId so the delta sync knows where to start after
  // the initial import completes. The profile fetch above already returned it.
  if (profile.historyId) {
    await adminSupabase
      .from('email_accounts')
      .update({ last_history_id: String(profile.historyId) })
      .eq('id', account.id)
  }

  await tasks.trigger('import-gmail-history', { accountId: account.id })

  return NextResponse.redirect(successUrl)
}
