'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { EmailSidePanel } from '@/components/room/email-side-panel'

interface AppContentProps {
  children: React.ReactNode
}

export function AppContent({ children }: AppContentProps) {
  const { isOpen } = useEmailSidePanel()
  const [showPanel, setShowPanel] = useState(false)

  // Keep panel in the DOM for 200ms after close so the exit animation completes.
  useEffect(() => {
    if (isOpen) {
      setShowPanel(true)
    } else {
      const timer = setTimeout(() => setShowPanel(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  return (
    <div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
      <main
        className={cn(
          'min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:flex-1 w-0' : 'flex-1',
        )}
      >
        {children}
      </main>

      {/* Email side panel: separate rounded panel that slides in from the right. */}
      <div
        className={cn(
          'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-1/2 w-full' : 'w-0',
        )}
      >
        {showPanel && (
          <div
            className={cn(
              'h-full bg-background border border-border rounded-3xl overflow-hidden transition-transform duration-200 ease-out',
              isOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <EmailSidePanel />
          </div>
        )}
      </div>
    </div>
  )
}
