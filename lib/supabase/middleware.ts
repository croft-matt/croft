import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that never require authentication.
const PUBLIC_PATHS = ['/home', '/sign-in', '/auth/callback', '/auth/sign-out', '/api/email/inbound', '/api/webhooks/stripe']

// Routes that need auth but are part of the onboarding flow itself.
// The middleware must not redirect these into an infinite loop.
const ONBOARDING_PATHS = ['/onboarding']

// Routes where we skip the onboarding DB check entirely.
// API routes and auth routes handle their own access control.
const SKIP_ONBOARDING_CHECK_PREFIXES = ['/api/', '/auth/', '/sign-in', '/home', '/_next']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function skipOnboardingCheck(pathname: string): boolean {
  return SKIP_ONBOARDING_CHECK_PREFIXES.some((p) => pathname.startsWith(p))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Must use getUser(). Never getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    const destination = pathname === '/' ? '/home' : '/sign-in'
    const url = request.nextUrl.clone()
    url.pathname = destination
    if (destination === '/sign-in' && pathname !== '/') {
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  // Authenticated users: check onboarding state before allowing cockpit access.
  // Skip this check on API routes, auth routes, and the onboarding screens themselves.
  if (user && !skipOnboardingCheck(pathname) && !isOnboardingPath(pathname)) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(onboarding_complete)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membership) {
      const workspaceId = membership.workspace_id
      const onboardingComplete = (membership.workspaces as { onboarding_complete: boolean } | null)?.onboarding_complete ?? false

      if (!onboardingComplete) {
        // Check whether Gmail has been connected yet.
        const { data: account } = await supabase
          .from('email_accounts')
          .select('id')
          .eq('workspace_id', workspaceId)
          .limit(1)
          .maybeSingle()

        const url = request.nextUrl.clone()
        url.pathname = account ? '/onboarding/processing' : '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
