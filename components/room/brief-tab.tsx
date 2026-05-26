'use client'

import { cn } from '@/lib/utils'
import { useJobModal } from '@/stores/job-modal-store'
import { EmailCitation } from '@/components/room/email-citation'
import type { BriefData } from '@/lib/rooms/brief'
import type { OpenLoop } from '@/lib/jobs/open-loops'

interface BriefTabProps {
  brief: BriefData
  workspaceId: string
  parentName: string | null
  roomSummary: string | null
}

function urgencyDot(due: string | null): string {
  if (!due) return 'bg-muted-foreground/40'
  const d = new Date(due)
  const now = new Date()
  if (d < now) return 'bg-red-500'
  if (d < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}

function urgencyBadge(due: string | null): { label: string; className: string } | null {
  if (!due) return { label: 'no deadline', className: 'bg-white/5 text-muted-foreground/60' }
  const d = new Date(due)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays > 0) return { label: `${diffDays}d overdue`, className: 'bg-red-500/10 text-red-300' }
  const daysUntil = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntil <= 7) return { label: `due in ${daysUntil}d`, className: 'bg-amber-500/10 text-amber-300' }
  return null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground/60">
        {label}
      </p>
      <span className="text-[10px] text-muted-foreground/60 border border-white/5 bg-white/[0.04] px-1.5 py-px rounded-full leading-none">
        {count}
      </span>
    </div>
  )
}

export function BriefTab({ brief, parentName, roomSummary }: BriefTabProps) {
  const { open: openModal } = useJobModal()
  const hasTheirCourt = brief.theirCourt.length > 0
  const hasWhatsComing = brief.whatsComing.length > 0
  const theirCourtTotal = brief.theirCourt.reduce((sum, g) => sum + g.loops.length, 0)

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 64 }}>
      <div className="rounded-xl border border-border bg-card" style={{ padding: '36px 40px' }}>

        {/* Anchor */}
        {brief.anchor && (
          <div className="mb-5">
            <h1
              className="font-medium text-foreground leading-snug mb-1"
              style={{ fontSize: 23, letterSpacing: '-0.02em' }}
            >
              {brief.anchor.label}
            </h1>
            <p className="text-[13px] text-muted-foreground/60">
              {formatDate(brief.anchor.date)}
              {parentName && <span> &middot; {parentName}</span>}
            </p>
          </div>
        )}

        {/* AI summary */}
        {roomSummary && (
          <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-6">
            {roomSummary}
          </p>
        )}

        {/* Status line */}
        {brief.status && (
          <div
            className="border-l-2 border-white/[0.06] pl-3.5 leading-relaxed mb-8"
            style={{ fontSize: 13.5, color: 'hsl(var(--muted-foreground))' }}
          >
            {brief.status}
          </div>
        )}

        {/* Your court */}
        <div className={hasTheirCourt || hasWhatsComing ? 'mb-7' : ''}>
          <SectionHeading label="Your court" count={brief.yourCourt.length} />
          {brief.yourCourt.length === 0 ? (
            <p className="text-[13px] text-muted-foreground/60 py-1">Nothing is waiting on you here.</p>
          ) : (
            <div className="space-y-2">
              {brief.yourCourt.map((loop) => {
                const badge = urgencyBadge(loop.due)
                return (
                  <div
                    key={loop.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openModal(loop)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModal(loop) }}
                    className="flex w-full items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] hover:border-white/[0.09] transition-colors cursor-pointer"
                  >
                    <span className={cn('mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full', urgencyDot(loop.due))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-foreground leading-snug mb-0.5">
                        {loop.description}
                      </p>
                      <p className="text-[12px] text-muted-foreground/60 leading-snug">
                        {loop.from_name ?? ''}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 mt-0.5">
                      {badge && (
                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap', badge.className)}>
                          {badge.label}
                        </span>
                      )}
                      <EmailCitation emailId={loop.email_id} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Their court */}
        {hasTheirCourt && (
          <div className={hasWhatsComing ? 'mb-7' : ''}>
            <SectionHeading label="Their court" count={theirCourtTotal} />
            <div className="space-y-2">
              {brief.theirCourt.map((group) => {
                const displayName = group.name ?? group.displayAddress ?? group.personKey
                const oldestLoop = group.loops[0]
                const nameLabel = group.loops.length > 1 ? `${displayName} (${group.loops.length})` : displayName
                const initials = (group.name ?? group.displayAddress ?? '?')
                  .split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase()

                return (
                  <div
                    key={group.personKey}
                    className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                  >
                    <div
                      className="shrink-0 rounded-full flex items-center justify-center"
                      style={{ width: 24, height: 24, background: '#1e1e22', border: '1px solid rgba(255,255,255,0.07)', marginTop: 1 }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 500, color: '#71717a' }}>{initials}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] text-foreground leading-snug mb-0.5 truncate">{nameLabel}</p>
                      {oldestLoop && (
                        <p className="text-[12px] text-muted-foreground/60 truncate leading-snug">
                          {oldestLoop.description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-muted-foreground/60 whitespace-nowrap">
                        silent {group.longestSilenceDays}d
                      </span>
                      {oldestLoop && <EmailCitation emailId={oldestLoop.email_id} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* What's coming */}
        {hasWhatsComing && (
          <div>
            <SectionHeading label="What's coming" count={brief.whatsComing.length} />
            <div className="space-y-1.5">
              {brief.whatsComing.map((item) => (
                <div key={item.jobId} className="flex items-center gap-3 py-2">
                  <span className="shrink-0 rounded-full" style={{ width: 5, height: 5, background: '#3f3f46' }} />
                  <p className="min-w-0 flex-1 text-[13.5px] text-muted-foreground/60 leading-snug">
                    {item.description}
                  </p>
                  {item.kind && (
                    <span className="shrink-0 text-[11px] text-muted-foreground/40">{item.kind}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
