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
      <div className="flex items-center gap-2 px-6 pt-4 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
              className={cn(
                'h-[27px] px-[10px] text-xs font-medium rounded-full transition-colors inline-flex items-center cursor-pointer',
              activeTab === tab.id
                ? 'bg-[#202021] text-white'
                : 'bg-[#141415] text-[#949496] hover:text-white'
            )}
            style={
              activeTab === tab.id
                ? { boxShadow: '0px 0px 0px 0.5px rgba(255, 255, 255, 0.16)' }
                : { boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.08), 0px 4px 4px -1px rgba(0, 0, 0, 0.04), 0px 0px 0px 0.5px rgba(255, 255, 255, 0.14)' }
            }
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
