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
// Uses create_workspace_with_owner RPC so both inserts are atomic: if the membership
// insert fails the workspace row is rolled back, preventing an orphaned workspace
// that would leave the user with a permanently broken account.
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

  const { error } = await admin.rpc('create_workspace_with_owner', {
    p_workspace_id: workspaceId,
    p_name: name,
    p_receiving_address: receivingAddress,
    p_croft_email_address: croftEmailAddress,
    p_user_id: userId,
  })

  if (error) {
    console.error('[auth/callback] create_workspace_with_owner failed:', error)
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
