'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Stage = 'idle' | 'instructions' | 'importing'

interface SetupClientProps {
  workspaceId: string
}

export function SetupClient({ workspaceId }: SetupClientProps) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [receivingAddress, setReceivingAddress] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on('broadcast', { event: 'forwarding_setup_required' }, ({ payload }) => {
        const p = payload as { receivingAddress: string }
        setReceivingAddress(p.receivingAddress)
        setStage('instructions')
      })
      .on('broadcast', { event: 'forwarding_configured' }, () => {
        setStage('importing')
      })
      .on('broadcast', { event: 'history_import_started' }, () => {
        router.push('/onboarding/processing')
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, router])

  function handleCopy() {
    if (!receivingAddress) return
    navigator.clipboard.writeText(receivingAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (stage === 'instructions' && receivingAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">
              Add your Croft address to Gmail forwarding
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste this address into Gmail and Croft handles the rest.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
            <span className="flex-1 truncate font-mono text-xs text-foreground">
              {receivingAddress}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="shrink-0">1.</span>
              Open Gmail and go to Settings (gear icon) &gt; See all settings
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">2.</span>
              Click the Forwarding and POP/IMAP tab
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">3.</span>
              Click Add a forwarding address and paste the address above
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">4.</span>
              A verification email will arrive -- Croft confirms it automatically
            </li>
            <li className="flex gap-2">
              <span className="shrink-0">5.</span>
              Select Forward a copy of incoming mail and save changes
            </li>
          </ol>

          <div className="flex items-center gap-2">
            <WaitingDot />
            <span className="text-sm text-muted-foreground">Waiting for confirmation...</span>
          </div>

          <p className="text-xs text-muted-foreground/60">
            Check your email -- we sent the address there too.
          </p>
        </div>
      </div>
    )
  }

  const statusText =
    stage === 'importing'
      ? 'Importing your last 7 days of email...'
      : 'Setting up your account...'

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Spinner />
          </div>
          <p className="text-sm text-muted-foreground">{statusText}</p>
        </div>
      </div>
    </div>
  )
}

function WaitingDot() {
  return (
    <span
      className={cn(
        'inline-flex h-2 w-2 shrink-0 rounded-full bg-muted-foreground animate-pulse',
      )}
    />
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
