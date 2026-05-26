'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail, Palette, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/settings/email', label: 'Email', icon: Mail },
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
]

export function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar sticky top-0">
      {/* Back link */}
      <div className="px-3 pt-6 pb-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          style={{ color: 'var(--sidebar-muted-foreground)' }}
        >
          <ChevronLeft className="h-3 w-3 shrink-0" />
          Back to app
        </Link>
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3">
        {/* Section header */}
        <div className="flex items-center rounded-lg px-2 mb-1" style={{ height: '28px' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--sidebar-muted-foreground)' }}>
            Settings
          </span>
        </div>

        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
              style={{ color: isActive ? undefined : 'var(--sidebar-muted-foreground)' }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
