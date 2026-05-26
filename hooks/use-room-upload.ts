'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UploadState {
  uploading: boolean
  progress: number // 0-100, count-based not byte-based
  errors: string[]
}

export function useRoomUpload(roomId: string) {
  const router = useRouter()
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    errors: [],
  })

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      if (!fileArray.length) return

      setState({ uploading: true, progress: 0, errors: [] })

      const formData = new FormData()
      fileArray.forEach((f) => formData.append('files', f))

      try {
        const res = await fetch(`/api/rooms/${roomId}/upload`, {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()

        const errors = (json.results ?? [])
          .filter((r: { error?: string }) => r.error)
          .map((r: { error: string; filename: string }) => `${r.filename}: ${r.error}`)

        setState({ uploading: false, progress: 100, errors })
        router.refresh()
      } catch {
        setState({ uploading: false, progress: 0, errors: ['Upload failed. Please try again.'] })
      }
    },
    [roomId, router]
  )

  const openPicker = useCallback(
    (multiple = true) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = multiple
      input.onchange = () => {
        if (input.files?.length) upload(input.files)
      }
      input.click()
    },
    [upload]
  )

  return { ...state, upload, openPicker }
}
