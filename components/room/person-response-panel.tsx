'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, X, Paperclip, Plus, Loader2, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { useEmailSidePanel } from '@/stores/email-side-panel-store'
import { ToField, type Recipient } from '@/components/job-modal/to-field'
import { AssetPickerModal } from '@/components/room/asset-picker-modal'
import { intentBadgeClass } from '@/components/room/email-side-panel'
import {
  fetchPersonResponseJobs,
  fetchConnectedAddresses,
  markJobsDone,
  sendReply,
  fetchWorkspaceAssetsForCompose,
  type PersonResponseJob,
} from '@/app/(app)/rooms/[id]/actions/send-reply'
import { buildPersonReplyBody, firstNameFrom } from '@/lib/email/compose'
import type { AssetGroup, WorkspaceAsset } from '@/lib/queries/assets'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelView = 'filling' | 'reviewing' | 'sending' | 'sent'

interface ItemState {
  jobId: string
  description: string
  intent: string
  emailId: string
  sourceSubject: string | null
  sourceReceivedAt: string
  answer: string
}

const INTENT_PLACEHOLDER: Record<string, string> = {
  REQUEST: 'e.g. Yes, confirmed...',
  CHASE: 'e.g. Yes, confirmed...',
  QUERY: 'e.g. The answer is...',
  DELIVER: 'e.g. Sending this now...',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string): string {
  const parts = name.replace(/['"]/g, '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ---------------------------------------------------------------------------
// Panel header (defined outside main component to avoid remount on re-render)
// ---------------------------------------------------------------------------

interface PanelHeaderProps {
  onBack: () => void
  title: string
  onClose: () => void
}

function PanelHeader({ onBack, title, onClose }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-border">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-xs">Back</span>
      </button>
      <span className="text-xs font-medium text-foreground">{title}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PersonResponsePanel
// ---------------------------------------------------------------------------

export function PersonResponsePanel() {
  const {
    respondPersonAddress,
    respondPersonName,
    respondRoomId,
    closeRespond,
  } = useEmailSidePanel()

  const personAddress = respondPersonAddress ?? ''
  const personName = respondPersonName ?? null
  const displayName = personName ?? personAddress

  const [view, setView] = useState<PanelView>('filling')
  const [items, setItems] = useState<ItemState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [senderFirstName, setSenderFirstName] = useState('')

  const initialRecipient: Recipient = {
    name: personName ?? personAddress.split('@')[0],
    email: personAddress,
  }
  const [toRecipients, setToRecipients] = useState<Recipient[]>([initialRecipient])
  const [ccRecipients, setCcRecipients] = useState<Recipient[]>([])
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState('')
  const [editingSubject, setEditingSubject] = useState(false)

  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [assetModalOpen, setAssetModalOpen] = useState(false)
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([])
  const [assetGroupsLoading, setAssetGroupsLoading] = useState(false)
  const [assetGroupsFetched, setAssetGroupsFetched] = useState(false)

  const allAssets: WorkspaceAsset[] = assetGroups.flatMap((g) => g.assets)

  // Fetch jobs and sender context on mount.
  // respondRoomId and respondPersonAddress are stable for the panel's lifetime.
  useEffect(() => {
    if (!respondRoomId || !respondPersonAddress) {
      setLoading(false)
      return
    }

    Promise.all([
      fetchPersonResponseJobs(respondRoomId, respondPersonAddress),
      fetchConnectedAddresses(),
    ]).then(([jobs, addresses]) => {
      setItems(
        (jobs as PersonResponseJob[]).map((job) => ({
          jobId: job.id,
          description: job.description,
          intent: job.intent,
          emailId: job.email_id,
          sourceSubject: job.sourceSubject,
          sourceReceivedAt: job.sourceReceivedAt,
          answer: '',
        })),
      )

      const senderAddr = addresses[0] ?? ''
      setSenderFirstName(firstNameFrom(senderAddr))

      // Seed subject from the most recent source email.
      const mostRecent = (jobs as PersonResponseJob[]).reduce<PersonResponseJob | null>(
        (best, job) => {
          if (!best) return job
          return job.sourceReceivedAt > best.sourceReceivedAt ? job : best
        },
        null,
      )
      const rawSubject = mostRecent?.sourceSubject ?? null
      setSubject(
        rawSubject
          ? `Re: ${rawSubject.startsWith('Re: ') ? rawSubject.slice(4) : rawSubject}`
          : 'Re: (no subject)',
      )

      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const answeredItems = items.filter((i) => i.answer.trim().length > 0)
  const skippedCount = items.length - answeredItems.length
  const canReview = answeredItems.length > 0
  const recipientFirstName = firstNameFrom(personName ?? personAddress)

  const mostRecentEmailId = items.reduce<string | null>((best, item) => {
    if (!best) return item.emailId
    const bestItem = items.find((i) => i.emailId === best)
    if (!bestItem) return item.emailId
    return item.sourceReceivedAt > bestItem.sourceReceivedAt ? item.emailId : best
  }, null)

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function updateAnswer(jobId: string, answer: string) {
    setItems((prev) => prev.map((i) => (i.jobId === jobId ? { ...i, answer } : i)))
  }

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

  async function handleMarkAllDone() {
    setError(null)
    const result = await markJobsDone(items.map((i) => i.jobId))
    if (result.success) {
      closeRespond()
    } else {
      setError(result.error ?? 'Failed to close jobs.')
    }
  }

  async function handleSend() {
    if (!mostRecentEmailId || !respondRoomId) return
    setView('sending')
    setError(null)

    const body = buildPersonReplyBody(
      answeredItems.map((i) => ({ description: i.description, answer: i.answer })),
      recipientFirstName,
      senderFirstName,
    )

    const result = await sendReply({
      roomId: respondRoomId,
      emailId: mostRecentEmailId,
      to: toRecipients.map((r) => r.email),
      cc: ccRecipients.length > 0 ? ccRecipients.map((r) => r.email) : undefined,
      body,
      selectedAssetIds,
      closingJobIds: answeredItems.map((i) => i.jobId),
    })

    if (!result.success) {
      setError(result.error ?? 'Failed to send.')
      setView('reviewing')
      return
    }

    setView('sent')
    setTimeout(() => closeRespond(), 1200)
  }

  // ---------------------------------------------------------------------------
  // Sent state
  // ---------------------------------------------------------------------------

  if (view === 'sent') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background gap-2">
        <CheckCheck className="h-6 w-6 text-green-400" />
        <p className="text-sm font-medium text-foreground">Sent</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Reviewing / sending view
  // ---------------------------------------------------------------------------

  if (view === 'reviewing' || view === 'sending') {
    const isSending = view === 'sending'
    const selectedAssets = allAssets.filter((a) => selectedAssetIds.includes(a.id))

    return (
      <div className="w-full h-full flex flex-col overflow-hidden bg-background">
        <PanelHeader
          onBack={() => setView('filling')}
          title="Review"
          onClose={closeRespond}
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 space-y-5">
          {/* Recipients summary */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-8 shrink-0 pt-0.5">To</span>
              <span className="text-xs text-foreground">
                {toRecipients.map((r) => r.name || r.email).join(', ')}
              </span>
            </div>
            {ccRecipients.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground w-8 shrink-0 pt-0.5">CC</span>
                <span className="text-xs text-foreground">
                  {ccRecipients.map((r) => r.name || r.email).join(', ')}
                </span>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground w-8 shrink-0 pt-0.5">Re</span>
              <span className="text-xs text-foreground">{subject}</span>
            </div>
          </div>

          {/* Body preview */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Hi {recipientFirstName},</p>

            {answeredItems.length === 1 ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                  {answeredItems[0].answer.trim()}
                </p>
              </div>
            ) : (
              answeredItems.map((item) => (
                <div key={item.jobId} className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Re: {item.description}</p>
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                      {item.answer.trim()}
                    </p>
                  </div>
                </div>
              ))
            )}

            <p className="text-xs text-muted-foreground">
              Best,
              <br />
              {senderFirstName}
            </p>
          </div>

          {/* Attachment chips */}
          {selectedAssets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedAssets.map((asset) => (
                <span
                  key={asset.id}
                  className="flex items-center gap-1.5 rounded-md border border-input bg-input px-2.5 py-1.5 text-xs text-foreground"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {asset.filename.length > 28
                    ? asset.filename.slice(0, 25) + '...'
                    : asset.filename}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="px-5 py-4 border-t border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCheck className="h-3.5 w-3.5" />
              Closes {answeredItems.length} {answeredItems.length === 1 ? 'job' : 'jobs'} on send
            </span>
            {skippedCount > 0 && (
              <span className="text-amber-400">
                {skippedCount} {skippedCount === 1 ? 'item' : 'items'} not included,{' '}
                {skippedCount === 1 ? 'job stays' : 'jobs stay'} open
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setView('filling')}
              disabled={isSending}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-40"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Send and close {answeredItems.length}{' '}
              {answeredItems.length === 1 ? 'job' : 'jobs'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Filling view (default)
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-background">
      <PanelHeader onBack={closeRespond} title="Respond" onClose={closeRespond} />

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Person header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
              hashNeutral(personAddress),
            )}
          >
            {getInitials(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            {displayName !== personAddress && (
              <p className="text-xs text-muted-foreground truncate">{personAddress}</p>
            )}
          </div>
          {!loading && items.length > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {/* Items list */}
        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <>
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="rounded-md border border-border bg-muted/20 px-3 py-3 space-y-2 animate-pulse"
                >
                  <div className="h-3 rounded bg-muted w-1/4" />
                  <div className="h-3 rounded bg-muted w-3/4" />
                  <div className="h-12 rounded bg-muted w-full mt-2" />
                </div>
              ))}
            </>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open items from this person in this room.
            </p>
          ) : (
            items.map((item) => {
              const badgeClass = intentBadgeClass[item.intent] ?? 'bg-muted text-muted-foreground'
              const placeholder = INTENT_PLACEHOLDER[item.intent] ?? 'Your answer...'
              const truncatedSubject =
                item.sourceSubject && item.sourceSubject.length > 40
                  ? item.sourceSubject.slice(0, 40) + '...'
                  : item.sourceSubject

              return (
                <div
                  key={item.jobId}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
                        badgeClass,
                      )}
                    >
                      {item.intent}
                    </span>
                    <span className="text-xs text-foreground leading-snug">
                      {item.description}
                    </span>
                  </div>
                  {truncatedSubject && (
                    <p className="text-[11px] text-muted-foreground">
                      {truncatedSubject} &middot; {formatRelativeTime(item.sourceReceivedAt)}
                    </p>
                  )}
                  <textarea
                    value={item.answer}
                    onChange={(e) => updateAnswer(item.jobId, e.target.value)}
                    placeholder={placeholder}
                    rows={2}
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
                    aria-label={`Answer for: ${item.description}`}
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Send details */}
        {!loading && items.length > 0 && (
          <div className="px-5 pb-4 pt-2 space-y-4 border-t border-border">
            <div className="pt-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">To</label>
              <ToField recipients={toRecipients} onChange={setToRecipients} />
            </div>

            {showCc ? (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  CC
                </label>
                <ToField recipients={ccRecipients} onChange={setCcRecipients} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCc(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                + Add CC
              </button>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Subject
              </label>
              {editingSubject ? (
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onBlur={() => setEditingSubject(false)}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="w-full rounded-md border border-ring bg-input px-3 py-2 text-sm text-foreground outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingSubject(true)}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 min-h-9 text-left hover:border-foreground/30 transition-colors"
                >
                  <span className="text-sm text-muted-foreground truncate">{subject}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">edit</span>
                </button>
              )}
            </div>

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
                        asset.filename.length > 28
                          ? asset.filename.slice(0, 25) + '...'
                          : asset.filename
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
          </div>
        )}
      </div>

      {error && (
        <div className="px-5 pb-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={handleMarkAllDone}
          disabled={loading || items.length === 0}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Mark all done
        </button>
        <button
          type="button"
          onClick={() => setView('reviewing')}
          disabled={!canReview}
          className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity disabled:opacity-40"
        >
          Review and send
        </button>
      </div>

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
