'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UploadState {
  uploading: boolean
  errors: string[]
}

export function useWorkspaceUpload() {
  const router = useRouter()
  const [state, setState] = useState<UploadState>({ uploading: false, errors: [] })

  const upload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (!fileArray.length) return

    setState({ uploading: true, errors: [] })

    const formData = new FormData()
    fileArray.forEach((f) => formData.append('files', f))

    try {
      const res = await fetch('/api/assets/upload', { method: 'POST', body: formData })
      const json = await res.json()

      const errors = (json.results ?? [])
        .filter((r: { error?: string }) => r.error)
        .map((r: { error: string; filename: string }) => `${r.filename}: ${r.error}`)

      setState({ uploading: false, errors })
      router.refresh()
    } catch {
      setState({ uploading: false, errors: ['Upload failed. Please try again.'] })
    }
  }, [router])

  const openPicker = useCallback((multiple = true) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.onchange = () => {
      if (input.files?.length) upload(input.files)
    }
    input.click()
  }, [upload])

  return { ...state, upload, openPicker }
}
