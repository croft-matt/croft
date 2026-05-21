'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useJobModal } from '@/stores/job-modal-store'
import { JobHeader } from '@/components/job-modal/job-header'
import { ToField, type Recipient } from '@/components/job-modal/to-field'
import { AssetField } from '@/components/job-modal/asset-field'
import { NoteField } from '@/components/job-modal/note-field'
import { ActionBar } from '@/components/job-modal/action-bar'
import { AssetSuggestionCard } from '@/components/job-modal/asset-suggestion'
import { generateNote } from '@/lib/jobs/note-template'
import { completeJob } from '@/lib/jobs/complete'
import { getJobContext, type JobContext } from '@/lib/jobs/get-job-context'
import { suggestAsset, type AssetSuggestion } from '@/lib/jobs/suggest-asset'

export function JobModal() {
  const { job, close } = useJobModal()
  const [mounted, setMounted] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<JobContext | null>(null)
  const [suggestion, setSuggestion] = useState<AssetSuggestion | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Reset form and fetch context when job changes
  useEffect(() => {
    if (!job) {
      setRecipients([])
      setFile(null)
      setNote('')
      setError(null)
      setContext(null)
      return
    }

    setContext(null)
    setSuggestion(null)

    suggestAsset(job.description).then((s) => {
      setSuggestion(s)
    })

    getJobContext(job.id).then((ctx) => {
      setContext(ctx)

      // Pre-populate recipients based on intent
      const workspaceAddresses = new Set<string>()
      let preselected: Recipient[] = []

      const allParticipants = [
        ...(ctx.toAddresses ?? []),
        ...(ctx.ccAddresses ?? []),
      ].filter((a) => !workspaceAddresses.has(a))

      if (job.intent === 'REQUEST' && ctx.senderEmail) {
        preselected = [{ name: ctx.senderName ?? ctx.senderEmail.split('@')[0], email: ctx.senderEmail }]
      } else if (job.intent === 'CHASE' && job.owner && job.owner.includes('@')) {
        preselected = [{ name: job.owner.split('@')[0], email: job.owner }]
      } else if (ctx.senderEmail) {
        preselected = [
          { name: ctx.senderName ?? ctx.senderEmail.split('@')[0], email: ctx.senderEmail },
          ...allParticipants
            .filter((a) => a !== ctx.senderEmail)
            .map((a) => ({ name: a.split('@')[0], email: a })),
        ]
      } else if (job.owner && job.owner.includes('@')) {
        preselected = [{ name: job.owner.split('@')[0], email: job.owner }]
      }

      const unique = preselected.filter(
        (r, i, arr) => arr.findIndex((x) => x.email === r.email) === i
      )
      setRecipients(unique)

      const recipientName = unique[0]?.name ?? 'there'
      setNote(generateNote(job, recipientName))
    })
  }, [job?.id])

  // Update note template when the first recipient name changes (user edits TO field).
  // Only fires after context has loaded to avoid clobbering the initial populate.
  useEffect(() => {
    if (!job || !context) return
    const first = recipients[0]
    if (first) {
      setNote(generateNote(job, first.name))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients[0]?.name])

  async function handleSubmit() {
    if (!job) return
    if (recipients.length === 0) {
      setError('Add at least one recipient.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('jobId', job.id)
      formData.append('to', JSON.stringify(recipients.map((r) => r.email)))
      formData.append('bodyText', note)
      if (file) formData.append('asset', file)

      const result = await completeJob(formData)
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.')
        return
      }
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (!loading) close()
  }

  if (!mounted || !job) return null

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[560px] rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden">
        <JobHeader job={job} roomName={context?.roomName ?? null} senderName={context?.senderName ?? null} />

        <div className="flex flex-col gap-5 px-5 py-5 overflow-y-auto max-h-[60vh]">
          <ToField recipients={recipients} onChange={setRecipients} />
          {suggestion && !file && (
            <AssetSuggestionCard
              suggestion={suggestion}
              onAttach={(s) => {
                // Convert suggestion to a File-like placeholder so the
                // existing upload path stays simple. Store the suggestion
                // ID separately so complete.ts skips re-uploading.
                setSuggestion(null)
                // Signal the suggestion was attached via a flag file name
                const blob = new Blob([], { type: 'application/octet-stream' })
                const fakeFile = new File([blob], s.filename, { type: 'application/octet-stream' })
                Object.defineProperty(fakeFile, '__suggestionId', { value: s.id })
                setFile(fakeFile)
              }}
            />
          )}
          <AssetField file={file} onChange={setFile} />
          <NoteField value={note} onChange={setNote} />
        </div>

        <ActionBar
          onCancel={handleClose}
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
