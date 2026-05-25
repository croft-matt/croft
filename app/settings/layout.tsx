import { requireUser } from '@/lib/auth/helpers'
import { SettingsSidebar } from '@/components/settings/nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      <SettingsSidebar />
      <div className="flex flex-1 flex-col py-2 pr-2 min-h-0">
        <main className="flex-1 bg-background border border-border rounded-3xl overflow-y-auto px-10 py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
