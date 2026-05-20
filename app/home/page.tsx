import Link from 'next/link'

// Public marketing landing page.
// Full content will be designed separately.
// Sign in button goes to /sign-in — after auth, user lands on /.
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-white">Croft</h1>
          <p className="text-lg text-neutral-400">
            Email intelligence for project-based professionals.
          </p>
        </div>

        <p className="text-sm leading-relaxed text-neutral-500">
          Croft processes your email in the background, extracts what matters,
          and gives you a clear view of every active project.
        </p>

        <div className="flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 hover:bg-neutral-100 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
