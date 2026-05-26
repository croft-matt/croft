'use client'

import { create } from 'zustand'
import type { CommandContext, CommandDefinition } from '@/lib/command-palette/registry'

export interface SubStep {
  prompt: string
  commands: CommandDefinition[]
}

export interface AskSource {
  label: string
  roomId?: string
  emailId?: string
}

export interface AskResponse {
  answer: string
  sources: AskSource[]
}

interface CommandPaletteStore {
  open: boolean
  context: CommandContext
  subStep: SubStep | null
  // Set to a room ID to signal RoomHeader to enter inline rename mode.
  triggerRenameRoomId: string | null
  // Room context for Ask queries -- set by room-shell while a room is mounted.
  currentRoomId: string | null
  // Ask state
  askState: 'idle' | 'loading' | 'answer' | 'error'
  currentQuery: string
  askResult: AskResponse | null
  askMode: boolean
  openPalette: (context?: CommandContext) => void
  closePalette: () => void
  pushSubStep: (step: SubStep) => void
  popSubStep: () => void
  triggerRenameRoom: (roomId: string) => void
  clearRenameRoomTrigger: () => void
  setCurrentRoomId: (roomId: string | null) => void
  setAskState: (state: 'idle' | 'loading' | 'answer' | 'error') => void
  setCurrentQuery: (q: string) => void
  setAskResult: (result: AskResponse | null) => void
  setAskMode: (v: boolean) => void
  resetAsk: () => void
}

export const useCommandPalette = create<CommandPaletteStore>((set) => ({
  open: false,
  context: 'always',
  subStep: null,
  triggerRenameRoomId: null,
  currentRoomId: null,
  askState: 'idle',
  currentQuery: '',
  askResult: null,
  askMode: false,
  openPalette: (context = 'always') =>
    set({ open: true, context, subStep: null, askState: 'idle', currentQuery: '', askResult: null, askMode: false }),
  closePalette: () =>
    set({ open: false, subStep: null, askState: 'idle', currentQuery: '', askResult: null, askMode: false }),
  pushSubStep: (step) => set({ subStep: step }),
  popSubStep: () => set({ subStep: null }),
  triggerRenameRoom: (roomId) => set({ triggerRenameRoomId: roomId }),
  clearRenameRoomTrigger: () => set({ triggerRenameRoomId: null }),
  setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
  setAskState: (state) => set({ askState: state }),
  setCurrentQuery: (q) => set({ currentQuery: q }),
  setAskResult: (result) => set({ askResult: result }),
  setAskMode: (v) => set({ askMode: v }),
  resetAsk: () => set({ askState: 'idle', currentQuery: '', askResult: null, askMode: false }),
}))
