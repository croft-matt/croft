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
      <p className="text-xs text-neutral-500 shrink-0 pt-1">
        Scanning in background.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="shrink-0 inline-flex items-center rounded px-3 py-1.5 text-xs font-medium border border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-opacity disabled:opacity-40"
    >
      {pending ? 'Starting...' : 'Scan for duplicates'}
    </button>
  )
}
