'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ArrowLeft, Paperclip, File, Send, Loader2 } from 'lucide-react'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { getEmailPanelData, type EmailPanelData } from '@/lib/email/actions'
import { EmailHeader } from '@/components/email/email-header'
import { EmailProcessingProvider } from '@/components/email/email-processing'
import { sendReply, getReplysuggestion, fetchComposeAssets } from '@/app/(app)/rooms/[id]/actions/send-reply'
import type { ComposeAsset } from '@/lib/ai/reply-suggestion'
import { cn } from '@/lib/utils'
import type { Email } from '@/lib/types/database'

// ---------------------------------------------------------------------------
// ComposeArea
// ---------------------------------------------------------------------------

interface SentEmailPreview {
  from_address: string
  to: string[]
  subject: string
  body: string
  sentAt: string
}

interface ComposeAreaProps {
  email: Email
  roomId: string | null
  onClose: () => void
  onSent: (preview: SentEmailPreview) => void
}

function ComposeArea({ email, roomId, onClose, onSent }: ComposeAreaProps) {
  const [to, setTo] = useState(email.from_address)
  const subject = email.subject
    ? `Re: ${email.subject.startsWith('Re: ') ? email.subject.slice(4) : email.subject}`
    : 'Re: (no subject)'

  const [body, setBody] = useState('')
  const [suggestionLoading, setSuggestionLoading] = useState(true)
  const [assets, setAssets] = useState<ComposeAsset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch suggestion and room assets when compose opens.
  useEffect(() => {
    if (!roomId) {
      setSuggestionLoading(false)
      return
    }

    setSuggestionLoading(true)

    Promise.all([
      getReplysuggestion(email.id, roomId),
      fetchComposeAssets(roomId),
    ]).then(([suggestion, roomAssets]) => {
      setBody(suggestion)
      setAssets(roomAssets)

      // Pre-select chips where the suggestion mentions the asset by filename.
      if (suggestion && roomAssets.length > 0) {
        const lowerSuggestion = suggestion.toLowerCase()
        const preSelected = roomAssets
          .filter((a) => lowerSuggestion.includes(a.filename.toLowerCase()))
          .map((a) => a.id)
        setSelectedAssetIds(preSelected)
      }

      setSuggestionLoading(false)
      // Focus the textarea after suggestion loads.
      textareaRef.current?.focus()
    })
  // Only runs once when compose opens for this email + room combination.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, roomId])

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSend() {
    if (!body.trim() || suggestionLoading || sending) return
    setError(null)
    setSending(true)

    const toAddresses = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const result = await sendReply({
      roomId: roomId ?? '',
      emailId: email.id,
      to: toAddresses,
      body: body.trim(),
      selectedAssetIds,
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
      body: body.trim(),
      sentAt: new Date().toISOString(),
    })
  }

  return (
    <div className="bg-background flex flex-col pt-4">
      {/* To field */}
      <div className="px-6 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">To</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
            aria-label="To"
          />
        </div>
      </div>

      {/* Subject (read-only) */}
      <div className="px-6 pb-3">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">Subject</span>
          <span className="flex-1 text-xs text-muted-foreground/70 truncate">{subject}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pb-3 relative">
        {suggestionLoading ? (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3 space-y-2 min-h-[120px]">
            <div className="h-3 rounded bg-muted animate-pulse w-3/4" />
            <div className="h-3 rounded bg-muted animate-pulse w-full" />
            <div className="h-3 rounded bg-muted animate-pulse w-1/2" />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Write your reply..."
            className="w-full rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-border resize-none leading-relaxed"
            aria-label="Reply body"
          />
        )}
      </div>

      {/* Asset chips */}
      {assets.length > 0 && (
        <div className="px-6 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {assets.map((asset) => {
              const selected = selectedAssetIds.includes(asset.id)
              const truncated =
                asset.filename.length > 24
                  ? asset.filename.slice(0, 21) + '...'
                  : asset.filename
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => toggleAsset(asset.id)}
                  title={asset.filename}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border',
                    selected
                      ? 'bg-foreground/10 border-foreground/20 text-foreground'
                      : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                  )}
                >
                  {selected ? (
                    <Paperclip className="h-3 w-3 shrink-0" />
                  ) : (
                    <File className="h-3 w-3 shrink-0" />
                  )}
                  {truncated}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-6 pb-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 pb-5 flex items-center justify-between gap-3">
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
          onClick={handleSend}
          disabled={!body.trim() || suggestionLoading || sending}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send
        </button>
      </div>
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
  | { mode: 'compose' }
  | { mode: 'sent'; preview: SentEmailPreview }

export function EmailSidePanel() {
  const { emailId, history, close, goBack } = useEmailSidePanel()
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
    })
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
          <div className="flex-1 overflow-y-auto">
            <ComposeArea
              email={data.email}
              roomId={roomId}
              onClose={handleCancelCompose}
              onSent={handleSent}
            />
          </div>
        </div>
      )}
    </div>
  )
}
