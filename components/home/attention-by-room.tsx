'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { WaitingEmail, OverdueJob } from '@/lib/queries/home'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashNeutral(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const options = ['bg-neutral-700', 'bg-neutral-600', 'bg-stone-600', 'bg-zinc-600']
  return options[Math.abs(hash) % options.length]
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function daysOverdueFromDue(due: string): number {
  return Math.ceil((Date.now() - new Date(due).getTime()) / 86400000)
}

function daysOverdueFromResponseBy(responseBy: string | null): number | null {
  if (!responseBy) return null
  const ms = Date.now() - new Date(responseBy).getTime()
  if (ms <= 0) return null
  return Math.ceil(ms / 86400000)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AttentionItem =
  | { kind: 'job'; data: OverdueJob; daysOverdue: number }
  | { kind: 'email'; data: WaitingEmail; daysOverdue: number | null }

interface RoomGroup {
  roomId: string | null
  roomName: string
  parentRoomName: string | null
  items: AttentionItem[]
  worstDaysOverdue: number | null
}

// ─── Grouping logic ───────────────────────────────────────────────────────────

function buildGroups(
  waitingEmails: WaitingEmail[],
  overdueJobs: OverdueJob[]
): RoomGroup[] {
  const byRoom = new Map<string | null, RoomGroup>()

  function getOrCreate(
    roomId: string | null,
    roomName: string,
    parentRoomName: string | null
  ): RoomGroup {
    const key = roomId ?? '__inbox__'
    if (!byRoom.has(key)) {
      byRoom.set(key, { roomId, roomName, parentRoomName, items: [], worstDaysOverdue: null })
    }
    return byRoom.get(key)!
  }

  // Overdue jobs go in first.
  for (const job of overdueJobs) {
    const days = daysOverdueFromDue(job.due)
    const group = getOrCreate(job.roomId, job.roomName ?? 'Inbox', job.parentRoomName)
    group.items.push({ kind: 'job', data: job, daysOverdue: days })
    if (group.worstDaysOverdue === null || days > group.worstDaysOverdue) {
      group.worstDaysOverdue = days
    }
  }

  // Emails: skip if the same room already has a job for this email's room
  // (avoids duplicating the same event). Still add emails from rooms with
  // no jobs, and inbox emails.
  const roomsWithJobs = new Set(overdueJobs.map((j) => j.roomId ?? '__inbox__'))

  for (const email of waitingEmails) {
    const key = email.roomId ?? '__inbox__'
    if (roomsWithJobs.has(key)) continue

    const days = daysOverdueFromResponseBy(email.responseBy)
    const group = getOrCreate(email.roomId, email.roomName ?? 'Inbox', email.parentRoomName)
    group.items.push({ kind: 'email', data: email, daysOverdue: days })
    if (days !== null) {
      if (group.worstDaysOverdue === null || days > group.worstDaysOverdue) {
        group.worstDaysOverdue = days
      }
    }
  }

  // Sort items within each group: most overdue first, nulls last.
  for (const group of byRoom.values()) {
    group.items.sort((a, b) => {
      if (a.daysOverdue === null && b.daysOverdue === null) return 0
      if (a.daysOverdue === null) return 1
      if (b.daysOverdue === null) return -1
      return b.daysOverdue - a.daysOverdue
    })
  }

  // Sort groups: red (>=3d) first, then amber (1-2d), then no-deadline, each
  // sub-sorted by worst days descending.
  return [...byRoom.values()].sort((a, b) => {
    const aBucket = a.worstDaysOverdue === null ? 0 : a.worstDaysOverdue >= 3 ? 2 : 1
    const bBucket = b.worstDaysOverdue === null ? 0 : b.worstDaysOverdue >= 3 ? 2 : 1
    if (bBucket !== aBucket) return bBucket - aBucket
    return (b.worstDaysOverdue ?? 0) - (a.worstDaysOverdue ?? 0)
  })
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function OverdueBadge({ days }: { days: number | null }) {
  if (days === null) return null
  if (days >= 3) {
    return (
      <span className="rounded px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400">
        {days}d overdue
      </span>
    )
  }
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400">
      {days}d overdue
    </span>
  )
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item }: { item: AttentionItem }) {
  const href =
    item.kind === 'job'
      ? item.data.roomId
        ? `/rooms/${item.data.roomId}`
        : `/emails/${item.data.emailId}?from=/`
      : `/emails/${item.data.id}?from=/`

  const displayName =
    item.kind === 'job'
      ? item.data.fromName
      : item.data.fromName

  const address =
    item.kind === 'job'
      ? item.data.fromName ?? ''
      : item.data.fromAddress

  const text =
    item.kind === 'job'
      ? item.data.description
      : item.data.subjectSummary ?? item.data.fromAddress

  const initials = getInitials(displayName, address)
  const avatarBg = hashNeutral(address)

  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-muted/50 transition-colors"
    >
      <div
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
          avatarBg
        )}
      >
        {initials}
      </div>
      <p className="text-sm text-foreground leading-relaxed line-clamp-2">{text}</p>
    </Link>
  )
}

// ─── Room group card ──────────────────────────────────────────────────────────

function RoomGroupCard({ group }: { group: RoomGroup }) {
  const preview = group.items.slice(0, 2)
  const overflow = group.items.length - 2

  const headerHref = group.roomId ? `/rooms/${group.roomId}` : '/'

  return (
    <div className="rounded-xl border border-border bg-muted/40 overflow-hidden">
      <Link
        href={headerHref}
        className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{group.roomName}</p>
          {group.parentRoomName && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {group.parentRoomName}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <OverdueBadge days={group.worstDaysOverdue} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </Link>

      <div className="px-3 py-2 space-y-0.5">
        {preview.map((item, i) => (
          <ItemRow
            key={item.kind === 'job' ? item.data.id : item.data.id + i}
            item={item}
          />
        ))}
        {overflow > 0 && (
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            + {overflow} more
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AttentionByRoomProps {
  waitingEmails: WaitingEmail[]
  overdueJobs: OverdueJob[]
}

export function AttentionByRoom({ waitingEmails, overdueJobs }: AttentionByRoomProps) {
  if (waitingEmails.length === 0 && overdueJobs.length === 0) return null

  const groups = buildGroups(waitingEmails, overdueJobs)

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <RoomGroupCard
          key={group.roomId ?? '__inbox__'}
          group={group}
        />
      ))}
    </div>
  )
}
