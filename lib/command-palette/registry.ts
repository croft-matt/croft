import type { LucideIcon } from 'lucide-react'

export type CommandGroup =
  | 'navigate'
  | 'rooms'
  | 'jobs'
  | 'blocks'
  | 'contacts'
  | 'views'
  | 'intelligence'

// 'always' = available on any screen; 'in-room' = only when on a room page.
export type CommandContext = 'always' | 'in-room'

export interface CommandDefinition {
  id: string
  group: CommandGroup
  label: string
  keywords?: string[]
  icon?: LucideIcon
  // Display only — not wired as a hotkey.
  shortcut?: string
  context: CommandContext
  action: () => void | Promise<void>
}

export const COMMAND_REGISTRY: CommandDefinition[] = []

export function registerCommands(commands: CommandDefinition[]): () => void {
  COMMAND_REGISTRY.push(...commands)
  return () => {
    commands.forEach((cmd) => {
      const idx = COMMAND_REGISTRY.findIndex((c) => c.id === cmd.id)
      if (idx !== -1) COMMAND_REGISTRY.splice(idx, 1)
    })
  }
}

export function getCommandsForContext(context: CommandContext): CommandDefinition[] {
  if (context === 'always') return COMMAND_REGISTRY.filter((c) => c.context === 'always')
  // 'in-room' returns everything (both always and in-room).
  return [...COMMAND_REGISTRY]
}
