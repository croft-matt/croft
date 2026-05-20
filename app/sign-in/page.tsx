import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, safeRelativePath } from '@/lib/auth/helpers'

async function sendMagicLink(formData: FormData) {
  'use server'

  const email = formData.get('email') as string
  const next = formData.get('next') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(safeRelativePath(next))}`,
    },
  })

  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`)
  }

  redirect('/sign-in?sent=1')
}

interface SignInPageProps {
  searchParams: Promise<{ error?: string; sent?: string; next?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams

  const user = await getCurrentUser()
  if (user) redirect(safeRelativePath(params.next) || '/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-white">Croft</h1>
          <p className="text-sm text-neutral-400">
            {params.sent ? 'Check your email for a sign-in link.' : 'Enter your email to sign in.'}
          </p>
        </div>

        {params.sent ? (
          <p className="text-center text-xs text-neutral-500">
            Wrong email?{' '}
            <a href="/sign-in" className="text-neutral-400 underline hover:text-white">
              Try again
            </a>
          </p>
        ) : (
          <form action={sendMagicLink} className="space-y-3">
            <input type="hidden" name="next" value={params.next ?? ''} />
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
            />
            {params.error && (
              <p className="text-xs text-red-400">{params.error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors"
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
