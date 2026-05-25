'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/settings/email', label: 'Email', icon: Mail },
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5">
      <p className="px-2 pb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Settings
      </p>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
            pathname === href || pathname.startsWith(href)
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
