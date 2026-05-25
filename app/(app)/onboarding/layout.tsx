import { requireUser } from '@/lib/auth/helpers'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
