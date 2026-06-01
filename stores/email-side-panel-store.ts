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
  // Respond mode -- PersonResponsePanel renders instead of EmailSidePanel.
  respondMode: boolean
  respondPersonAddress: string | null
  respondPersonName: string | null
  respondRoomId: string | null
  // Set when respond mode was triggered from an open email, so Back can return to it.
  respondReturnToEmailId: string | null
  open: (emailId: string, tab?: 'jobs' | 'email') => void
  openWithResolve: (emailId: string, jobId: string) => void
  consumePendingResolveJobIds: () => string[]
  navigateTo: (emailId: string) => void
  goBack: () => void
  close: () => void
  openRespond: (params: {
    personAddress: string
    personName: string | null
    roomId: string
    returnToEmailId?: string
  }) => void
  closeRespond: () => void
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
      respondMode: false,
      respondPersonAddress: null,
      respondPersonName: null,
      respondRoomId: null,
      respondReturnToEmailId: null,

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

      openRespond: ({ personAddress, personName, roomId, returnToEmailId }) => {
        const scrollY = document.querySelector('main')?.scrollTop ?? 0
        set({
          isOpen: true,
          respondMode: true,
          respondPersonAddress: personAddress,
          respondPersonName: personName,
          respondRoomId: roomId,
          respondReturnToEmailId: returnToEmailId ?? null,
          roomScrollY: scrollY,
          pendingResolveJobIds: [],
        })
      },

      closeRespond: () => {
        const { respondReturnToEmailId, roomScrollY } = get()
        if (respondReturnToEmailId) {
          set({
            respondMode: false,
            respondPersonAddress: null,
            respondPersonName: null,
            respondRoomId: null,
            respondReturnToEmailId: null,
            emailId: respondReturnToEmailId,
          })
        } else {
          set({
            isOpen: false,
            respondMode: false,
            respondPersonAddress: null,
            respondPersonName: null,
            respondRoomId: null,
            respondReturnToEmailId: null,
            emailId: null,
            initialTab: 'jobs',
            history: [],
            pendingResolveJobIds: [],
            roomScrollY: 0,
          })
          const main = document.querySelector('main')
          if (main) main.scrollTop = roomScrollY
        }
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
