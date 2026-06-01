'use client'

import { create } from 'zustand'

export interface AskSource {
  label: string
  type: 'email' | 'asset' | 'job' | 'room'
  id: string
}

interface SearchStore {
  open: boolean
  currentRoomId: string | null
  askState: 'idle' | 'loading' | 'answer' | 'not_found' | 'error'
  currentQuery: string
  askAnswer: string | null
  askSources: AskSource[] | null
  notFoundReason: string | null
  openSearch: () => void
  closeSearch: () => void
  setCurrentRoomId: (id: string | null) => void
  setAskState: (state: SearchStore['askState']) => void
  setCurrentQuery: (q: string) => void
  setAskAnswer: (answer: string | null) => void
  setAskSources: (sources: AskSource[] | null) => void
  setNotFoundReason: (reason: string | null) => void
  resetAsk: () => void
}

export const useCommandPalette = create<SearchStore>((set) => ({
  open: false,
  currentRoomId: null,
  askState: 'idle',
  currentQuery: '',
  askAnswer: null,
  askSources: null,
  notFoundReason: null,
  openSearch: () =>
    set((s) => {
      s.resetAsk?.()
      return { open: true, askState: 'idle', currentQuery: '', askAnswer: null, askSources: null, notFoundReason: null }
    }),
  closeSearch: () =>
    set({ open: false, askState: 'idle', currentQuery: '', askAnswer: null, askSources: null, notFoundReason: null }),
  setCurrentRoomId: (id) => set({ currentRoomId: id }),
  setAskState: (state) => set({ askState: state }),
  setCurrentQuery: (q) => set({ currentQuery: q }),
  setAskAnswer: (answer) => set({ askAnswer: answer }),
  setAskSources: (sources) => set({ askSources: sources }),
  setNotFoundReason: (reason) => set({ notFoundReason: reason }),
  resetAsk: () =>
    set({ askState: 'idle', currentQuery: '', askAnswer: null, askSources: null, notFoundReason: null }),
}))
