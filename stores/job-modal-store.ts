'use client'

import { create } from 'zustand'

interface JobModalState {
  jobId: string | null
  open: (jobId: string) => void
  close: () => void
}

export const useJobModal = create<JobModalState>((set) => ({
  jobId: null,
  open: (jobId) => set({ jobId }),
  close: () => set({ jobId: null }),
}))
