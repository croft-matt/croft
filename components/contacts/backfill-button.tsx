'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'

interface BackfillButtonProps {
  action: () => Promise<void>
}

export function BackfillButton({ action }: BackfillButtonProps) {
  const [pending, startTransition] = useTransition()
  const [triggered, setTriggered] = useState(false)
  const router = useRouter()

  function handleClick() {
    startTransition(async () => {
      await action()
      setTriggered(true)
      router.refresh()
    })
  }

  if (triggered) {
    return (
      <p className="text-xs text-muted-foreground shrink-0 pt-1">
        Scanning in background.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 inline-flex items-center rounded px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground transition-opacity disabled:opacity-40"
    >
      {pending ? 'Starting...' : 'Scan for duplicates'}
    </button>
  )
}
