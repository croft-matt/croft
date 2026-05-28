'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EmailSidePanelState {
  isOpen: boolean
  emailId: string | null
  initialTab: 'jobs' | 'email'
  history: string[]
  roomScrollY: number
  // Job IDs to pre-attach when compose opens (Resolve path).
  pendingResolveJobIds: string[]
  open: (emailId: string, tab?: 'jobs' | 'email') => void
  openWithResolve: (emailId: string, jobId: string) => void
  consumePendingResolveJobIds: () => string[]
  navigateTo: (emailId: string) => void
  goBack: () => void
  close: () => void
}

export const useEmailSidePanel = create<EmailSidePanelState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      emailId: null,
      initialTab: 'jobs',
      history: [],
      roomScrollY: 0,
      pendingResolveJobIds: [],

      open: (emailId, tab = 'jobs') => {
        const scrollY = document.querySelector('main')?.scrollTop ?? 0
        set({ isOpen: true, emailId, initialTab: tab, history: [], roomScrollY: scrollY, pendingResolveJobIds: [] })
      },

      openWithResolve: (emailId, jobId) => {
        const scrollY = document.querySelector('main')?.scrollTop ?? 0
        set({ isOpen: true, emailId, history: [], roomScrollY: scrollY, pendingResolveJobIds: [jobId] })
      },

      consumePendingResolveJobIds: () => {
        const ids = get().pendingResolveJobIds
        if (ids.length > 0) set({ pendingResolveJobIds: [] })
        return ids
      },

      navigateTo: (emailId) => {
        const current = get().emailId
        if (!current) return
        set((state) => ({ history: [...state.history, current], emailId }))
      },

      goBack: () => {
        const { history } = get()
        if (history.length === 0) {
          get().close()
          return
        }
        const prev = history[history.length - 1]
        set((state) => ({ emailId: prev, history: state.history.slice(0, -1) }))
      },

      close: () => {
        const { roomScrollY } = get()
        set({ isOpen: false, emailId: null, initialTab: 'jobs', history: [], roomScrollY: 0, pendingResolveJobIds: [] })
        const main = document.querySelector('main')
        if (main) main.scrollTop = roomScrollY
      },
    }),
    {
      name: 'croft-email-side-panel',
      // Only persist what's needed to reopen the panel after a refresh.
      // History, scroll position, and pending resolve IDs are transient.
      partialize: (state) => ({
        isOpen: state.isOpen,
        emailId: state.emailId,
      }),
    }
  )
)
