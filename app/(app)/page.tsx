import { requireUser } from '@/lib/auth/helpers'

// Cockpit: the main app dashboard.
// Unauthenticated users never reach this page — proxy redirects them to /home.
// This page will be built out in the cockpit UI brief.
export default async function CockpitPage() {
  const user = await requireUser()

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">Croft</h1>
        <p className="text-sm text-neutral-400">Signed in as {user.email}</p>
        <p className="text-xs text-neutral-600">Cockpit coming in the next brief.</p>
      </div>
    </div>
  )
}
