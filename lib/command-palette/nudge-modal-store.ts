'use client'

import { create } from 'zustand'
import type { OwnerGroup } from '@/lib/jobs/open-loops'

interface NudgeModalParams {
  group: OwnerGroup
  roomId: string
  roomName: string
  workspaceId: string
}

interface NudgeModalStore {
  open: boolean
  group: OwnerGroup | null
  roomId: string
  roomName: string
  workspaceId: string
  openNudgeModal: (params: NudgeModalParams) => void
  closeNudgeModal: () => void
}

export const useNudgeModal = create<NudgeModalStore>((set) => ({
  open: false,
  group: null,
  roomId: '',
  roomName: '',
  workspaceId: '',
  openNudgeModal: ({ group, roomId, roomName, workspaceId }) =>
    set({ open: true, group, roomId, roomName, workspaceId }),
  closeNudgeModal: () => set({ open: false, group: null }),
}))
