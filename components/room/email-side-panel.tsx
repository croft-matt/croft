'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ArrowLeft, Paperclip, Send, Loader2, CheckCheck, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { getEmailPanelData, type EmailPanelData } from '@/lib/email/actions'
import { EmailHeader } from '@/components/email/email-header'
import { EmailProcessingProvider } from '@/components/email/email-processing'
import {
  sendReply,
  getReplysuggestion,
  fetchWorkspaceAssetsForCompose,
  fetchOpenJobsForThread,
} from '@/app/(app)/rooms/[id]/actions/send-reply'
import { AssetPickerModal } from '@/components/room/asset-picker-modal'
import { ToField, type Recipient } from '@/components/job-modal/to-field'
import type { AssetGroup, WorkspaceAsset } from '@/lib/queries/assets'
import type { Email, Job } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Attached job types
// ---------------------------------------------------------------------------

interface AttachedJob {
  id: string
  intent: string
  description: string
  answer: string
}

function buildAttachedJob(job: Job, isFirst: boolean): AttachedJob {
  let answer = ''
  if (job.intent === 'DELIVER' || job.intent === 'CONFIRM') {
    answer = isFirst
      ? `Thanks for ${job.description} -- received.`
      : `You also sent ${job.description} -- noted.`
  }
  return { id: job.id, intent: job.intent, description: job.description, answer }
}

function buildBodyFromJobs(jobs: AttachedJob[]): string {
  return jobs
    .map((job, index) => {
      const isFirst = index === 0
      const isAction = ['REQUEST', 'CHASE', 'QUERY'].includes(job.intent)
      if (isAction) {
        const label = isFirst
          ? `You requested: ${job.description}`
          : `You also requested: ${job.description}`
        return `${label}\n${job.answer}`
      }
      return job.answer
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// SentEmailPreview
// ---------------------------------------------------------------------------

interface SentEmailPreview {
  from_address: string
  to: string[]
  subject: string
  body: string
  sentAt: string
}

// ---------------------------------------------------------------------------
// JobBlock
// ---------------------------------------------------------------------------

interface JobBlockProps {
  job: AttachedJob
  index: number
  onChange: (answer: string) => void
}

const intentBadgeClass: Record<string, string> = {
  REQUEST: 'bg-amber-500/10 text-amber-400',
  DELIVER: 'bg-blue-500/10 text-blue-400',
  CONFIRM: 'bg-muted text-foreground',
  CHASE: 'bg-red-500/10 text-red-400',
  QUERY: 'bg-muted text-muted-foreground',
  INTRODUCE: 'bg-muted text-muted-foreground',
}

function JobBlock({ job, index, onChange }: JobBlockProps) {
  const isFirst = index === 0
  const isAction = ['REQUEST', 'CHASE', 'QUERY'].includes(job.intent)
  const badgeClass = intentBadgeClass[job.intent] ?? 'bg-muted text-muted-foreground'

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
            badgeClass,
          )}
        >
          {job.intent}
        </span>
        {isAction && (
          <span className="text-xs text-muted-foreground leading-snug">
            {isFirst ? `You requested: ${job.description}` : `You also requested: ${job.description}`}
          </span>
        )}
      </div>
      <textarea
        value={job.answer}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isAction ? 'Your answer...' : undefined}
        rows={isAction ? 2 : 1}
        className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
        aria-label={`Answer for: ${job.description}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ComposeArea
// ---------------------------------------------------------------------------

interface ComposeAreaProps {
  email: Email
  roomId: string | null
  emailJobs: Job[]
  onClose: () => void
  onSent: (preview: SentEmailPreview) => void
  initialJobIds?: string[]
}

function ComposeArea({ email, roomId, emailJobs, onClose, onSent, initialJobIds }: ComposeAreaProps) {
  const initialRecipient: Recipient = {
    name: email.from_address.split('@')[0],
    email: email.from_address,
  }
  const [recipients, setRecipients] = useState<Recipient[]>([initialRecipient])
  const subject = email.subject
    ? `Re: ${email.subject.startsWith('Re: ') ? email.subject.slice(4) : email.subject}`
    : 'Re: (no subject)'

  const isResolvePath = (initialJobIds?.length ?? 0) > 0
  const jobsModeActiveRef = useRef(isResolvePath)

  const [body, setBody] = useState('')
  const [suggestionLoading, setSuggestionLoading] = useState(!isResolvePath)
  const [attachedJobs, setAttachedJobs] = useState<AttachedJob[]>(() => {
    if (!initialJobIds?.length) return []
    return initialJobIds
      .map((id, i) => {
        const job = emailJobs.find((j) => j.id === id)
        if (!job) return null
        return buildAttachedJob(job, i === 0)
      })
      .filter((j): j is AttachedJob => j !== null)
  })
  const [jobsModeActive, setJobsModeActive] = useState(isResolvePath)
  const [aiSuggestionNotice, setAiSuggestionNotice] = useState(false)

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([])
  const [assetGroupsLoading, setAssetGroupsLoading] = useState(false)
  const [assetGroupsFetched, setAssetGroupsFetched] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [allPickerJobs, setAllPickerJobs] = useState<Job[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerFetched, setPickerFetched] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const allAssets: WorkspaceAsset[] = assetGroups.flatMap((g) => g.assets)

  // Fetch AI suggestion on the Reply path (not Resolve path).
  useEffect(() => {
    if (isResolvePath || !roomId) {
      setSuggestionLoading(false)
      return
    }
    setSuggestionLoading(true)
    getReplysuggestion(email.id, roomId).then((suggestion) => {
      if (!jobsModeActiveRef.current) {
        setBody(suggestion)
        setSuggestionLoading(false)
        textareaRef.current?.focus()
      } else {
        setSuggestionLoading(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, roomId, isResolvePath])

  // Fetch picker jobs when the picker opens for the first time.
  useEffect(() => {
    if (!pickerOpen || pickerFetched) return
    setPickerLoading(true)
    fetchOpenJobsForThread(email.id, []).then((jobs) => {
      setAllPickerJobs(jobs)
      setPickerLoading(false)
      setPickerFetched(true)
    })
  }, [pickerOpen, pickerFetched, email.id])

  // cmd+J toggles the job picker.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setPickerOpen((p) => !p)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function openAssetModal() {
    setAssetModalOpen(true)
    if (assetGroupsFetched) return
    setAssetGroupsLoading(true)
    fetchWorkspaceAssetsForCompose().then((groups) => {
      setAssetGroups(groups)
      setAssetGroupsLoading(false)
      setAssetGroupsFetched(true)
    })
  }

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const addJob = useCallback(
    (job: Job) => {
      const isFirst = attachedJobs.length === 0
      if (!jobsModeActive) {
        setJobsModeActive(true)
        jobsModeActiveRef.current = true
        setBody('')
        setAiSuggestionNotice(true)
        setSuggestionLoading(false)
      }
      setAttachedJobs((prev) => [...prev, buildAttachedJob(job, isFirst && prev.length === 0)])
      setPickerOpen(false)
    },
    [attachedJobs.length, jobsModeActive],
  )

  function updateJobAnswer(jobId: string, answer: string) {
    setAttachedJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, answer } : j)),
    )
  }

  const availablePickerJobs = allPickerJobs.filter(
    (j) => !attachedJobs.some((a) => a.id === j.id),
  )

  const hasEmptyActionAnswers = attachedJobs.some(
    (j) => ['REQUEST', 'CHASE', 'QUERY'].includes(j.intent) && !j.answer.trim(),
  )
  const canSend = !sending && !suggestionLoading && recipients.length > 0 && (
    jobsModeActive && attachedJobs.length > 0
      ? !hasEmptyActionAnswers
      : body.trim().length > 0
  )

  async function handleSend() {
    if (!canSend) return
    setError(null)
    setSending(true)

    const toAddresses = recipients.map((r) => r.email)

    const finalBody = jobsModeActive && attachedJobs.length > 0
      ? buildBodyFromJobs(attachedJobs)
      : body.trim()

    const closingJobIds = jobsModeActive && attachedJobs.length > 0
      ? attachedJobs.map((j) => j.id)
      : []

    const result = await sendReply({
      roomId: roomId ?? '',
      emailId: email.id,
      to: toAddresses,
      body: finalBody,
      selectedAssetIds,
      closingJobIds: closingJobIds.length > 0 ? closingJobIds : undefined,
    })

    setSending(false)

    if (!result.success) {
      setError(result.error ?? 'Failed to send.')
      return
    }

    onSent({
      from_address: email.from_address,
      to: toAddresses,
      subject,
      body: finalBody,
      sentAt: new Date().toISOString(),
    })
  }

  return (
    <div className="relative bg-background flex flex-col flex-1 overflow-hidden">
      {/* Fields */}
      <div className="flex flex-col gap-5 px-5 py-5 flex-1 min-h-0">
        {/* To */}
        <ToField recipients={recipients} onChange={setRecipients} />

        {/* Subject (read-only) */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Subject</label>
          <div className="flex items-center rounded-md border border-input bg-input px-3 py-2 min-h-9">
            <span className="text-sm text-muted-foreground truncate">{subject}</span>
          </div>
        </div>

        {/* Notice when AI suggestion was replaced by job blocks */}
        {aiSuggestionNotice && (
          <p className="text-xs text-muted-foreground -mt-2">Reply updated to close attached jobs.</p>
        )}

        {/* Attachment */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Attachment (optional)
          </label>
          {selectedAssetIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {allAssets
                .filter((a) => selectedAssetIds.includes(a.id))
                .map((asset) => {
                  const truncated =
                    asset.filename.length > 28 ? asset.filename.slice(0, 25) + '...' : asset.filename
                  return (
                    <span
                      key={asset.id}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-input pl-2.5 pr-1.5 py-1.5 text-sm text-foreground"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{truncated}</span>
                      <button
                        type="button"
                        onClick={() => toggleAsset(asset.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Remove ${asset.filename}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  )
                })}
              <button
                type="button"
                onClick={openAssetModal}
                className="flex items-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add more
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAssetModal}
              className="flex items-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors w-full"
            >
              <Paperclip className="h-4 w-4" />
              Attach a file
            </button>
          )}
        </div>

        {/* Message */}
        <div className="flex flex-col flex-1 min-h-0">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message</label>
          {jobsModeActive && attachedJobs.length > 0 ? (
            <div className="space-y-2">
              {attachedJobs.map((job, index) => (
                <JobBlock
                  key={job.id}
                  job={job}
                  index={index}
                  onChange={(answer) => updateJobAnswer(job.id, answer)}
                />
              ))}
            </div>
          ) : suggestionLoading ? (
            <div className="rounded-md border border-input bg-input px-3 py-3 space-y-2 flex-1 min-h-[160px]">
              <div className="h-3 rounded bg-muted animate-pulse w-3/4" />
              <div className="h-3 rounded bg-muted animate-pulse w-full" />
              <div className="h-3 rounded bg-muted animate-pulse w-1/2" />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your reply..."
              className="flex-1 w-full min-h-[160px] rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring resize-none transition-colors leading-relaxed"
              aria-label="Reply body"
            />
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-5 pb-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Job picker (inline, above actions) */}
      {pickerOpen && (
        <div className="mx-5 mb-2 rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          {pickerLoading ? (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">Loading...</div>
          ) : availablePickerJobs.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">
              No other open jobs in this thread
            </div>
          ) : (
            <>
              {availablePickerJobs.slice(0, 10).map((job) => {
                const badgeClass = intentBadgeClass[job.intent] ?? 'bg-muted text-muted-foreground'
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => addJob(job)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
                        badgeClass,
                      )}
                    >
                      {job.intent}
                    </span>
                    <span className="text-xs text-foreground leading-snug">{job.description}</span>
                  </button>
                )
              })}
              {availablePickerJobs.length > 10 && (
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  {availablePickerJobs.length - 10} more not shown
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen((p) => !p)}
            className={cn(
              'flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors',
              pickerOpen && 'bg-muted',
            )}
            title="Add job (Cmd+J)"
          >
            <Plus className="h-3.5 w-3.5" />
            Add job
          </button>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : attachedJobs.length > 0 ? (
            <CheckCheck className="h-3.5 w-3.5" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {attachedJobs.length > 0
            ? `Send and close ${attachedJobs.length === 1 ? 'job' : `${attachedJobs.length} jobs`}`
            : 'Send'}
        </button>
      </div>

      {/* Asset picker modal */}
      {assetModalOpen && (
        <AssetPickerModal
          groups={assetGroups}
          loading={assetGroupsLoading}
          selectedIds={selectedAssetIds}
          onToggle={toggleAsset}
          onClose={() => setAssetModalOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SentConfirmation
// ---------------------------------------------------------------------------

function SentConfirmation({
  preview,
  onDismiss,
}: {
  preview: SentEmailPreview
  onDismiss: () => void
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="h-5 w-5 shrink-0 rounded-full bg-green-500/15 flex items-center justify-center mt-0.5">
          <Send className="h-2.5 w-2.5 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-0.5">Reply sent</p>
          <p className="text-xs text-muted-foreground truncate">
            To: {preview.to.join(', ')}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2 leading-relaxed">
            {preview.body.slice(0, 120)}{preview.body.length > 120 ? '...' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailSidePanel
// ---------------------------------------------------------------------------

type PanelState =
  | { mode: 'view' }
  | { mode: 'compose'; resolveJobIds?: string[] }
  | { mode: 'sent'; preview: SentEmailPreview }

export function EmailSidePanel() {
  const { emailId, history, close, goBack, consumePendingResolveJobIds } = useEmailSidePanel()
  const [data, setData] = useState<EmailPanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [panelState, setPanelState] = useState<PanelState>({ mode: 'view' })

  useEffect(() => {
    if (!emailId) {
      setData(null)
      setPanelState({ mode: 'view' })
      return
    }

    setLoading(true)
    setData(null)
    setPanelState({ mode: 'view' })

    getEmailPanelData(emailId).then((result) => {
      setData(result)
      setLoading(false)

      // If the panel was opened via the Resolve button, switch straight to compose
      // with those job IDs pre-loaded.
      const resolveJobIds = consumePendingResolveJobIds()
      if (resolveJobIds.length > 0) {
        setPanelState({ mode: 'compose', resolveJobIds })
      }
    })
  // consumePendingResolveJobIds is stable (Zustand action), safe to include.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId])

  const canGoBack = history.length > 0
  const roomId = data?.rooms[0]?.id ?? null

  function handleReply() {
    setPanelState({ mode: 'compose' })
  }

  function handleCancelCompose() {
    setPanelState({ mode: 'view' })
  }

  function handleSent(preview: SentEmailPreview) {
    setPanelState({ mode: 'sent', preview })
  }

  function handleDismissSent() {
    setPanelState({ mode: 'view' })
  }

  const composeResolveJobIds =
    panelState.mode === 'compose' ? (panelState.resolveJobIds ?? []) : []

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-background relative">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Narrow viewport only: "Back to room" affordance below the header. */}
      <button
        type="button"
        onClick={close}
        className="lg:hidden flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border shrink-0"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to room
      </button>

      {/* Scrollable email content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && (
          <div className="flex items-center gap-2 px-6 py-4 text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <p className="text-sm">Loading...</p>
          </div>
        )}

        {data && (
          <>
            <EmailHeader
              email={data.email}
              jobs={data.jobs}
              rooms={data.rooms}
              onReply={handleReply}
              repliedTo={panelState.mode === 'sent'}
            />
            <EmailProcessingProvider
              initialEmail={data.email}
              initialJobs={data.jobs}
              initialAssets={data.assets}
              initialExtractedContacts={data.extractedContacts}
              initialClosedByJobs={data.closedByThisEmail}
              rooms={data.rooms}
              workspaceId={data.workspaceId}
            />

            {panelState.mode === 'sent' && (
              <div className="px-6 pb-6">
                <SentConfirmation
                  preview={panelState.preview}
                  onDismiss={handleDismissSent}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose overlay -- slides over the email content */}
      {data && panelState.mode === 'compose' && (
        <div className="absolute inset-0 flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-border">
            <button
              type="button"
              onClick={handleCancelCompose}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back to email"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs">Back</span>
            </button>
            <span className="text-xs font-medium text-foreground">Reply</span>
            <button
              type="button"
              onClick={close}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <ComposeArea
              email={data.email}
              roomId={roomId}
              emailJobs={data.jobs}
              onClose={handleCancelCompose}
              onSent={handleSent}
              initialJobIds={composeResolveJobIds.length > 0 ? composeResolveJobIds : undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}
