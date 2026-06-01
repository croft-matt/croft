'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, CheckSquare, Users, Paperclip, Settings, Sparkles, FolderOpen } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useCommandPalette } from '@/stores/command-palette-store'
import { AskResult } from '@/components/command-palette/ask-result'

interface CommandPaletteProps {
  rooms: Array<{ id: string; name: string }>
  workspaceId: string
}

const PAGE_COMMANDS = [
  { cmd: 'home',     label: 'Home',     icon: Home,        path: '/' },
  { cmd: 'jobs',     label: 'All jobs', icon: CheckSquare, path: '/all-jobs' },
  { cmd: 'contacts', label: 'Contacts', icon: Users,       path: '/contacts' },
  { cmd: 'assets',   label: 'Assets',   icon: Paperclip,   path: '/assets' },
  { cmd: 'settings', label: 'Settings', icon: Settings,    path: '/settings' },
]

export function CommandPalette({ rooms, workspaceId }: CommandPaletteProps) {
  const router = useRouter()
  const {
    open,
    currentRoomId,
    askState,
    currentQuery,
    askAnswer,
    askSources,
    notFoundReason,
    openSearch,
    closeSearch,
    setAskState,
    setCurrentQuery,
    setAskAnswer,
    setAskSources,
    setNotFoundReason,
    resetAsk,
  } = useCommandPalette()

  const [inputValue, setInputValue] = useState('')

  // Reset input when palette closes.
  useEffect(() => {
    if (!open) setInputValue('')
  }, [open])

  // Global cmd+k / ctrl+k listener.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) {
          closeSearch()
        } else {
          openSearch()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeSearch, openSearch])

  const isSlash = inputValue.startsWith('/')
  const slashInput = isSlash ? inputValue.slice(1) : ''
  const [slashCmd, ...slashRest] = slashInput.split(' ')
  const slashFilter = slashRest.join(' ').toLowerCase().trim()

  const showingAsk = askState !== 'idle'
  const hasContent = inputValue.trim().length > 0

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
      const data = await res.json()
      if (data.not_found) {
        setAskState('not_found')
        setNotFoundReason(data.not_found_reason ?? null)
      } else {
        setAskState('answer')
        setAskAnswer(data.answer)
        setAskSources(data.sources)
      }
    } catch {
      setAskState('error')
    }
  }

  function handleClose() {
    resetAsk()
    setInputValue('')
    closeSearch()
  }

  function handleAskClose() {
    resetAsk()
    setInputValue('')
  }

  function renderSlashContent() {
    const cmdLower = slashCmd.toLowerCase()

    if (cmdLower === '' || 'room'.startsWith(cmdLower) || cmdLower === 'room') {
      // Show room list, filtered by slashFilter if under /room <filter>.
      const isRoomCmd = cmdLower === 'room' || cmdLower === ''
      const filteredRooms = isRoomCmd
        ? rooms.filter((r) =>
            slashFilter ? r.name.toLowerCase().includes(slashFilter) : true,
          )
        : []

      const pageMatches = PAGE_COMMANDS.filter((p) => p.cmd.startsWith(cmdLower) && cmdLower !== '')

      if (filteredRooms.length === 0 && pageMatches.length === 0) {
        return <CommandEmpty>No commands found.</CommandEmpty>
      }

      return (
        <>
          {pageMatches.length > 0 && (
            <CommandGroup heading="Go to">
              {pageMatches.map((p) => (
                <CommandItem
                  key={p.cmd}
                  value={p.cmd}
                  onSelect={() => {
                    closeSearch()
                    router.push(p.path)
                  }}
                  className="flex items-center gap-2"
                >
                  <p.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {filteredRooms.length > 0 && (
            <CommandGroup heading="Rooms">
              {filteredRooms.map((room) => (
                <CommandItem
                  key={room.id}
                  value={room.name}
                  onSelect={() => {
                    closeSearch()
                    router.push(`/rooms/${room.id}`)
                  }}
                  className="flex items-center gap-2"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{room.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </>
      )
    }

    // Match page commands by prefix.
    const pageMatches = PAGE_COMMANDS.filter((p) => p.cmd.startsWith(cmdLower))

    if (pageMatches.length === 0) {
      return <CommandEmpty>No commands found.</CommandEmpty>
    }

    return (
      <CommandGroup heading="Go to">
        {pageMatches.map((p) => (
          <CommandItem
            key={p.cmd}
            value={p.cmd}
            onSelect={() => {
              closeSearch()
              router.push(p.path)
            }}
            className="flex items-center gap-2"
          >
            <p.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{p.label}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    )
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
      }}
    >
      <Command
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            if (showingAsk) {
              handleAskClose()
            } else {
              closeSearch()
            }
          }
        }}
      >
        <CommandInput
          placeholder="Type / to navigate or ask anything..."
          value={inputValue}
          onValueChange={setInputValue}
          readOnly={askState === 'loading'}
        />

        {showingAsk ? (
          <AskResult
            query={currentQuery}
            state={askState as 'loading' | 'answer' | 'not_found' | 'error'}
            answer={askAnswer}
            sources={askSources}
            notFoundReason={notFoundReason}
            onRetry={() => handleAskCroft(currentQuery)}
            onClose={handleAskClose}
          />
        ) : isSlash ? (
          <CommandList>
            {renderSlashContent()}
          </CommandList>
        ) : hasContent ? (
          <CommandList>
            <CommandItem
              key="ask-croft"
              value={`ask-croft-${inputValue}`}
              onSelect={() => handleAskCroft(inputValue)}
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Ask Croft:{' '}
                <span className="text-muted-foreground">"{inputValue}"</span>
              </span>
            </CommandItem>
          </CommandList>
        ) : (
          <CommandList>
            <CommandItem disabled className="text-muted-foreground pointer-events-none">
              Type / to navigate
            </CommandItem>
            <CommandItem disabled className="text-muted-foreground pointer-events-none">
              Or ask anything about your projects
            </CommandItem>
          </CommandList>
        )}
      </Command>
    </CommandDialog>
  )
}
