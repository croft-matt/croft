import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'
import { redis } from '@/lib/ratelimit'

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
].join(' ')

// Route handlers must read cookies from request.cookies, not from cookies() via
// next/headers. The middleware updates request.cookies with refreshed tokens before
// passing the request here — next/headers cookies() reads the original request only.
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

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)

  const supabase = createRouteClient(request)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/sign-in`)
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.redirect(`${origin}/sign-in`)
  }

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')

  await redis.set(
    `gmail:pkce:${state}`,
    JSON.stringify({ verifier, workspaceId: membership.workspace_id, userId: user.id }),
    { ex: 600 }
  )

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/gmail/callback`,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  })

  return NextResponse.redirect(`${GOOGLE_OAUTH_URL}?${params}`)
}
