import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membership) {
    const { data: account } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('workspace_id', membership.workspace_id)
      .limit(1)
      .maybeSingle()

    if (account) {
      redirect('/onboarding/setup')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Connect your Gmail</h1>
          <p className="text-sm text-muted-foreground">
            Croft will set up email forwarding automatically. It takes about 30 seconds.
          </p>
        </div>
        <a
          href="/auth/gmail/connect?redirect_to=onboarding"
          className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Connect Gmail
        </a>
      </div>
    </div>
  )
}
