'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { retryForwarding } from './actions'

interface SetupClientProps {
  workspaceId: string
  accountId: string
  initialForwardingConfigured: boolean
  initialHistoryImported: boolean
}

export function SetupClient({
  workspaceId,
  accountId,
  initialForwardingConfigured,
  initialHistoryImported,
}: SetupClientProps) {
  const router = useRouter()
  const [forwardingDone, setForwardingDone] = useState(initialForwardingConfigured)
  const [historyDone, setHistoryDone] = useState(initialHistoryImported)
  const [forwardingFailed, setForwardingFailed] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on('broadcast', { event: 'forwarding_configured' }, () => {
        setForwardingDone(true)
        setForwardingFailed(false)
      })
      .on('broadcast', { event: 'forwarding_failed' }, () => {
        setForwardingFailed(true)
      })
      .on('broadcast', { event: 'history_imported' }, () => {
        setHistoryDone(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  // Once both are done, navigate to the processing gate.
  useEffect(() => {
    if (forwardingDone && historyDone) {
      router.push('/onboarding/processing')
    }
  }, [forwardingDone, historyDone, router])

  function handleRetry() {
    setForwardingFailed(false)
    startTransition(async () => {
      await retryForwarding(accountId)
    })
  }

  const statusText = forwardingFailed
    ? 'Something went wrong setting up forwarding.'
    : !forwardingDone
    ? 'Setting up email forwarding...'
    : !historyDone
    ? 'Importing your last 7 days of email...'
    : "You're in."

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            {!forwardingFailed && !(forwardingDone && historyDone) && (
              <Spinner />
            )}
          </div>
          <p className="text-sm text-muted-foreground">{statusText}</p>
        </div>

        {forwardingFailed && (
          <button
            onClick={handleRetry}
            disabled={isPending}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Retrying...' : 'Try again'}
          </button>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
