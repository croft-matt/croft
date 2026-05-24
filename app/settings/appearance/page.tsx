'use client'

import { useTheme } from 'next-themes'
import { updateThemePreference } from '@/lib/settings/appearance'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const options = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export default function AppearancePage() {
  const { theme, setTheme } = useTheme()

  function handleSelect(value: 'light' | 'dark' | 'system') {
    setTheme(value)
    updateThemePreference(value)
  }

  return (
    <div className="mx-auto max-w-lg space-y-10">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Appearance</h1>
        <p className="text-sm text-muted-foreground">
          Choose how Croft looks on this device.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Theme
        </p>
        <div className="flex gap-3">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              className={cn(
                'flex flex-1 flex-col items-center gap-2.5 rounded-xl border px-4 py-5 text-sm font-medium transition-colors',
                theme === value
                  ? 'border-foreground bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          System follows your device's appearance setting.
        </p>
      </div>
    </div>
  )
}
