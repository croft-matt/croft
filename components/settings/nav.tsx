'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/settings/email', label: 'Email', icon: Mail },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5">
      <p className="px-2 pb-3 text-xs font-medium uppercase tracking-widest text-neutral-600">
        Settings
      </p>
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
            pathname === href || pathname.startsWith(href)
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
