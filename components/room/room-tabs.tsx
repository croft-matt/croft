'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'assets' | 'contacts' | 'emails'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'assets', label: 'Assets' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'emails', label: 'Emails' },
]

interface RoomTabsProps {
  defaultTab: Tab
  overview: ReactNode
  assets: ReactNode
  contacts: ReactNode
  emails: ReactNode
}

export function RoomTabs({ defaultTab, overview, assets, contacts, emails }: RoomTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }

  const content: Record<Tab, ReactNode> = { overview, assets, contacts, emails }

  return (
    <div>
      <div className="flex border-b border-neutral-800 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'mr-6 pb-3 pt-3 text-sm transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-white text-white font-medium'
                : 'text-neutral-500 hover:text-neutral-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-6 px-6">
        {content[activeTab]}
      </div>
    </div>
  )
}
