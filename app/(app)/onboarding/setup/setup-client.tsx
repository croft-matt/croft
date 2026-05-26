'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SetupClientProps {
  workspaceId: string
}

export function SetupClient({ workspaceId }: SetupClientProps) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on('broadcast', { event: 'history_imported' }, () => {
        router.push('/onboarding/processing')
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, router])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Spinner />
          </div>
          <p className="text-sm text-muted-foreground">Importing your recent email...</p>
        </div>
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
