import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { Home, Plus, AlertCircle, Clock, VolumeX, Sparkles } from 'lucide-react'
import type { CommandDefinition } from './registry'
import { useCommandPalette } from '@/stores/command-palette-store'

export function buildStaticCommands(
  router: AppRouterInstance,
): CommandDefinition[] {
  const close = () => useCommandPalette.getState().closePalette()

  return [
    {
      id: 'nav-home',
      group: 'navigate',
      label: 'Go to Home',
      keywords: ['home', 'dashboard', 'start'],
      icon: Home,
      shortcut: 'G then H',
      context: 'always',
      action: () => { close(); router.push('/') },
    },
    {
      id: 'room-create',
      group: 'rooms',
      label: 'Create new room',
      keywords: ['new', 'project', 'add room'],
      icon: Plus,
      context: 'always',
      action: () => { close(); router.push('/rooms/new') },
    },
    {
      id: 'view-overdue',
      group: 'views',
      label: 'Show overdue items',
      keywords: ['overdue', 'late', 'past due', 'deadline'],
      icon: AlertCircle,
      context: 'always',
      action: () => { close(); router.push('/views/overdue') },
    },
    {
      id: 'view-awaiting-me',
      group: 'views',
      label: 'Show everything awaiting me',
      keywords: ['awaiting', 'waiting', 'my court', 'open loops', 'todo'],
      icon: Clock,
      context: 'always',
      action: () => { close(); router.push('/views/awaiting-me') },
    },
    {
      id: 'view-quiet-rooms',
      group: 'views',
      label: 'Show rooms with no recent activity',
      keywords: ['quiet', 'stale', 'inactive', 'silent', 'no activity'],
      icon: VolumeX,
      context: 'always',
      action: () => { close(); router.push('/views/quiet') },
    },
    {
      id: 'ask-croft',
      group: 'intelligence',
      label: 'Ask Croft anything...',
      keywords: ['ask', 'question', 'query', 'search', 'intelligence', 'ai'],
      icon: Sparkles,
      context: 'always',
      action: () => {
        useCommandPalette.getState().setAskMode(true)
      },
    },
  ]
}
