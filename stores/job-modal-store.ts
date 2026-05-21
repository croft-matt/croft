'use client'

import { create } from 'zustand'
import type { Job } from '@/lib/types/database'

interface JobModalState {
  job: Job | null
  open: (job: Job) => void
  close: () => void
}

export const useJobModal = create<JobModalState>((set) => ({
  job: null,
  open: (job) => set({ job }),
  close: () => set({ job: null }),
}))
