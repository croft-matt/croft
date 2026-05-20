import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public routes that never require authentication.
const PUBLIC_PATHS = ['/home', '/sign-in', '/auth/callback', '/auth/sign-out', '/api/email/inbound', '/api/webhooks/stripe']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
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
    // Unauthenticated users hitting the root go to /home (marketing).
    // Unauthenticated users hitting any other protected route go to /sign-in.
    const destination = pathname === '/' ? '/home' : '/sign-in'
    const url = request.nextUrl.clone()
    url.pathname = destination
    if (destination === '/sign-in' && pathname !== '/') {
      url.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
