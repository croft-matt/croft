import { CheckCircle, Circle, AlertTriangle, Mail } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>
}

export default async function EmailSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const user = await requireUser()

  const supabase = await createClient()
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const account = membership
    ? await getAccount(membership.workspace_id)
    : null

  const isRevoked =
    account !== null &&
    (account.access_token_encrypted === null || account.refresh_token_encrypted === null)

  return (
    <div className="min-h-screen bg-neutral-950 px-6 py-16">
      <div className="mx-auto max-w-lg space-y-10">

        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">Email connection</h1>
          <p className="text-sm text-neutral-400">
            Connect your Gmail account so Croft can receive and organise your email.
          </p>
        </div>

        {params.error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">
              Something went wrong ({params.error}). Please try again.
            </p>
          </div>
        )}

        {!account || isRevoked ? (
          <NotConnectedCard isRevoked={isRevoked} justConnected={false} />
        ) : (
          <ConnectedCard account={account} justConnected={params.connected === '1'} />
        )}

        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-600">
            How it works
          </h2>
          <ol className="space-y-2 text-sm text-neutral-400">
            <li className="flex gap-2">
              <span className="shrink-0 text-neutral-600">1.</span>
              Connect your Gmail account with read-only access.
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-neutral-600">2.</span>
              Croft sets up automatic forwarding — no manual steps required.
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-neutral-600">3.</span>
              Your last 7 days of email are imported and processed in the background.
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-neutral-600">4.</span>
              New email arrives automatically from that point on.
            </li>
          </ol>
        </div>

      </div>
    </div>
  )
}

function NotConnectedCard({ isRevoked }: { isRevoked: boolean; justConnected: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-4">
      {isRevoked ? (
        <>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <p className="text-sm font-medium text-white">Reconnection required</p>
          </div>
          <p className="text-sm text-neutral-400">
            Your Gmail connection was disconnected. Reconnect to resume email processing.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-neutral-500" />
            <p className="text-sm font-medium text-white">No account connected</p>
          </div>
          <p className="text-sm text-neutral-400">
            Connect Gmail to start receiving and organising your email in Croft.
          </p>
        </>
      )}
      <a
        href="/auth/gmail/connect"
        className="flex w-full items-center justify-center rounded-md bg-white px-4 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-100"
      >
        {isRevoked ? 'Reconnect Gmail' : 'Connect Gmail'}
      </a>
    </div>
  )
}

function ConnectedCard({
  account,
  justConnected,
}: {
  account: NonNullable<Awaited<ReturnType<typeof getAccount>>>
  justConnected: boolean
}) {
  const fullyReady = account.forwarding_configured && account.history_imported

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-white">{account.email_address}</p>
            <p className="text-xs text-neutral-500">Gmail</p>
          </div>
        </div>
        {justConnected && (
          <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            Just connected
          </span>
        )}
      </div>

      <div className="space-y-2">
        <StatusRow
          done={account.forwarding_configured}
          label="Forwarding configured"
          pending="Setting up email forwarding..."
        />
        <StatusRow
          done={account.history_imported}
          label="History imported"
          pending="Importing last 7 days of email..."
        />
      </div>

      {!fullyReady && (
        <p className="text-xs text-neutral-500">
          Setup is running in the background. This page will reflect progress on next refresh.
        </p>
      )}
    </div>
  )
}

function StatusRow({
  done,
  label,
  pending,
}: {
  done: boolean
  label: string
  pending: string
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-neutral-600" />
      )}
      <span className={done ? 'text-neutral-300' : 'text-neutral-500'}>
        {done ? label : pending}
      </span>
    </div>
  )
}

async function getAccount(workspaceId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('email_accounts')
    .select(
      'email_address, access_token_encrypted, refresh_token_encrypted, forwarding_configured, history_imported'
    )
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google')
    .limit(1)
    .maybeSingle()
  return data
}
