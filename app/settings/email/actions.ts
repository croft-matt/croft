'use server'

import { redirect } from 'next/navigation'
import { randomBytes, createHash } from 'crypto'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { redis } from '@/lib/ratelimit'

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
].join(' ')

export async function connectGmail() {
  const user = await requireUser()

  const supabase = await createClient()
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/sign-in')

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')

  // Store verifier + context so the callback can associate the tokens with the right workspace.
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

  redirect(`${GOOGLE_OAUTH_URL}?${params}`)
}
