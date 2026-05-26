'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Circle, FolderOpen, Sparkles } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useCommandPalette } from '@/stores/command-palette-store'
import type { AskResponse } from '@/stores/command-palette-store'
import {
  getCommandsForContext,
  registerCommands,
  type CommandDefinition,
  type CommandGroup as CGroup,
} from '@/lib/command-palette/registry'
import { buildStaticCommands } from '@/lib/command-palette/static-commands'
import { looksLikeQuestion } from '@/lib/command-palette/intent'
import { AskResult } from '@/components/command-palette/ask-result'

interface CommandPaletteProps {
  rooms: Array<{ id: string; name: string }>
  workspaceId: string
}

const GROUP_ORDER: CGroup[] = ['navigate', 'rooms', 'jobs', 'blocks', 'contacts', 'views', 'intelligence']

const GROUP_LABELS: Record<CGroup, string> = {
  navigate: 'Go to',
  rooms: 'Rooms',
  jobs: 'Jobs',
  blocks: 'Blocks',
  contacts: 'Contacts',
  views: 'Views',
  intelligence: 'Ask Croft',
}

// Groups that should be hidden entirely when they have no commands.
const OPTIONAL_GROUPS = new Set<CGroup>(['jobs', 'blocks', 'contacts'])

export function CommandPalette({ rooms, workspaceId }: CommandPaletteProps) {
  const router = useRouter()
  const {
    open,
    context,
    subStep,
    currentRoomId,
    askState,
    currentQuery,
    askResult,
    askMode,
    openPalette,
    closePalette,
    pushSubStep,
    popSubStep,
    setAskState,
    setCurrentQuery,
    setAskResult,
    setAskMode,
    resetAsk,
  } = useCommandPalette()

  const [inputValue, setInputValue] = useState('')

  // Track dynamically registered room nav commands so we can clean them up.
  const roomNavCleanupRef = useRef<(() => void) | null>(null)

  // Reset input when the palette closes.
  useEffect(() => {
    if (!open) setInputValue('')
  }, [open])

  // Register static commands once on mount.
  useEffect(() => {
    const commands = buildStaticCommands(router)
    const cleanup = registerCommands(commands)
    return cleanup
    // router is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global cmd+k / ctrl+k listener.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) {
          closePalette()
        } else {
          openPalette(context)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, context, closePalette, openPalette])

  // Register room navigation commands when the palette opens; clean up when it closes.
  useEffect(() => {
    if (open) {
      roomNavCleanupRef.current?.()
      const roomNavCommands: CommandDefinition[] = rooms.map((room) => ({
        id: `nav-room-${room.id}`,
        group: 'navigate' as const,
        label: room.name,
        keywords: ['room', 'project', 'go to'],
        icon: FolderOpen,
        context: 'always' as const,
        action: () => {
          closePalette()
          router.push(`/rooms/${room.id}`)
        },
      }))
      roomNavCleanupRef.current = registerCommands(roomNavCommands)
    } else {
      roomNavCleanupRef.current?.()
      roomNavCleanupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleSelect(cmd: CommandDefinition) {
    cmd.action()
  }

  // Count commands that roughly match the current query (for intent detection).
  function countMatchingCommands(query: string): number {
    if (!query.trim()) return Infinity
    const q = query.toLowerCase()
    return getCommandsForContext(context).filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      (cmd.keywords ?? []).some(k => k.toLowerCase().includes(q))
    ).length
  }

  const isQuestion = !subStep &&
    askState === 'idle' &&
    looksLikeQuestion(inputValue, countMatchingCommands(inputValue))

  async function handleAskCroft(query: string) {
    setAskState('loading')
    setCurrentQuery(query)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, roomId: currentRoomId ?? undefined, workspaceId }),
      })
      if (!res.ok) throw new Error('ask failed')
      const data: AskResponse = await res.json()
      setAskState('answer')
      setAskResult(data)
    } catch {
      setAskState('error')
    }
  }

  function handleAskClose() {
    resetAsk()
    setInputValue('')
  }

  // Build the grouped command list for the main view.
  function buildGroups(): Array<{ group: CGroup; commands: CommandDefinition[] }> {
    const all = getCommandsForContext(context)
    const grouped: Array<{ group: CGroup; commands: CommandDefinition[] }> = []

    for (const group of GROUP_ORDER) {
      const cmds = all.filter((c) => c.group === group)
      if (cmds.length === 0) continue
      if (OPTIONAL_GROUPS.has(group) && context === 'always') continue
      grouped.push({ group, commands: cmds })
    }

    return grouped
  }

  const showingAsk = askState !== 'idle'
  // When in askMode, treat typing as a question regardless of intent detection.
  const placeholder = askMode
    ? 'Ask Croft anything...'
    : subStep
      ? subStep.prompt
      : 'Type a command or search...'

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v && showingAsk) {
          handleAskClose()
        } else if (!v && subStep) {
          popSubStep()
        } else if (!v && askMode) {
          setAskMode(false)
        } else if (!v) {
          closePalette()
        }
      }}
    >
      <Command>
        <CommandInput
          placeholder={placeholder}
          value={inputValue}
          onValueChange={(val) => {
            setInputValue(val)
            // Exit ask mode if user clears the input.
            if (!val && askMode) setAskMode(false)
          }}
          readOnly={askState === 'loading'}
        />

        {showingAsk ? (
          <AskResult
            query={currentQuery}
            state={askState as 'loading' | 'answer' | 'error'}
            answer={askResult?.answer}
            sources={askResult?.sources}
            onRetry={() => handleAskCroft(currentQuery)}
            onClose={handleAskClose}
          />
        ) : (
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>

            {subStep ? (
              // Sub-step: render the sub-step commands as a flat list.
              <CommandGroup>
                {subStep.commands.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
                    onSelect={() => handleSelect(cmd)}
                    className="flex items-center gap-2"
                  >
                    {cmd.icon ? (
                      <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              // Main view: auto-surfaced Ask option first (when query looks like a question),
              // then commands grouped by section in fixed order.
              <>
                {(isQuestion || askMode) && inputValue.trim() && (
                  <CommandItem
                    key="ask-croft-auto"
                    value={`ask-croft-auto-${inputValue}`}
                    onSelect={() => handleAskCroft(inputValue)}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Ask Croft:{' '}
                      <span className="text-muted-foreground">"{inputValue}"</span>
                    </span>
                  </CommandItem>
                )}

                {buildGroups().map(({ group, commands }, idx) => (
                  <div key={group}>
                    {idx > 0 && <CommandSeparator />}
                    <CommandGroup heading={GROUP_LABELS[group]}>
                      {commands.map((cmd) => (
                        <CommandItem
                          key={cmd.id}
                          value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
                          onSelect={() => handleSelect(cmd)}
                          className="flex items-center gap-2"
                        >
                          {cmd.icon ? (
                            <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </div>
                ))}
              </>
            )}
          </CommandList>
        )}
      </Command>
    </CommandDialog>
  )
}
