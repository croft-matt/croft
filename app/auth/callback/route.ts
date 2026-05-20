import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeRelativePath } from '@/lib/auth/helpers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeRelativePath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await ensureWorkspace(data.user.id, data.user.email ?? '')
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=Could+not+sign+in`)
}

// Creates a workspace and owner membership for first-time users.
// Safe to call on every sign-in — exits immediately if a membership already exists.
async function ensureWorkspace(userId: string, email: string): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('workspace_members')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (existing) return

  const workspaceId = crypto.randomUUID()
  const name = deriveWorkspaceName(email)
  const receivingAddress = `${workspaceId}@inbound.yourcroft.com`
  const croftEmailAddress = deriveCroftAddress(email)

  const { error: wsError } = await admin.from('workspaces').insert({
    id: workspaceId,
    name,
    receiving_address: receivingAddress,
    croft_email_address: croftEmailAddress,
  })

  if (wsError) {
    console.error('[auth/callback] workspace insert failed:', wsError)
    return
  }

  const { error: memberError } = await admin.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: userId,
    role: 'owner',
  })

  if (memberError) {
    console.error('[auth/callback] workspace_members insert failed:', memberError)
  }
}

// Derives a human-readable workspace name from an email address.
// "matt@ordinaryworld.co" -> "Matt"
function deriveWorkspaceName(email: string): string {
  const local = email.split('@')[0] ?? email
  const first = local.split(/[._-]/)[0] ?? local
  return first.charAt(0).toUpperCase() + first.slice(1)
}

// Derives a Croft sending address from a user email.
// "matt.stevenson@ordinaryworld.co" -> "matt.stevenson@mail.yourcroft.com"
// "matt@ordinaryworld.co" -> "matt@mail.yourcroft.com"
function deriveCroftAddress(email: string): string {
  const local = email.split('@')[0] ?? 'user'
  const sanitised = local.toLowerCase().replace(/[^a-z0-9._-]/g, '')
  return `${sanitised}@mail.yourcroft.com`
}
