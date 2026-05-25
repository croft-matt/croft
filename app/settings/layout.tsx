import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { SettingsNav } from '@/components/settings/nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inbox
        </Link>
        <span className="text-sm font-medium text-foreground">Settings</span>
      </div>

      <div className="flex">
        <aside className="w-52 shrink-0 border-r border-border px-3 py-6">
          <SettingsNav />
        </aside>

        <main className="flex-1 px-10 py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
