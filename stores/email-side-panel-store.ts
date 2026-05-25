'use client'

import { create } from 'zustand'

interface EmailSidePanelState {
  emailId: string | null
  open: (emailId: string) => void
  close: () => void
}

export const useEmailSidePanel = create<EmailSidePanelState>((set) => ({
  emailId: null,
  open: (emailId) => set({ emailId }),
  close: () => set({ emailId: null }),
}))
