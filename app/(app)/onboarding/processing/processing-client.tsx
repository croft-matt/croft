'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ProcessingClientProps {
  workspaceId: string
  initialImportTotal: number
  initialImportN: number
  initialFilterN: number
  initialClassifyN: number
  initialRooms: number
}

export function ProcessingClient({
  workspaceId,
  initialImportTotal,
  initialImportN,
  initialFilterN,
  initialClassifyN,
  initialRooms,
}: ProcessingClientProps) {
  const router = useRouter()

  const [importTotal, setImportTotal] = useState(initialImportTotal)
  const [importN, setImportN] = useState(initialImportN)
  const [filterN, setFilterN] = useState(initialFilterN)
  const [filterTotal, setFilterTotal] = useState(initialImportN)
  const [classifyN, setClassifyN] = useState(initialClassifyN)
  const [classifyTotal, setClassifyTotal] = useState(initialFilterN)
  const [rooms, setRooms] = useState(initialRooms)
  const [complete, setComplete] = useState(false)

  // Track whether each stage has received at least one event, for greying out.
  const [filterStarted, setFilterStarted] = useState(initialFilterN > 0)
  const [classifyStarted, setClassifyStarted] = useState(initialClassifyN > 0)
  const [roomsStarted, setRoomsStarted] = useState(initialRooms > 0)

  // Used to stop the pulsing dot when complete.
  const roomsPulsing = roomsStarted && !complete

  // Keep a ref to router to avoid stale closure in the effect.
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`workspace:${workspaceId}`)
      .on('broadcast', { event: 'import_progress' }, ({ payload }) => {
        const p = payload as { n: number; total: number }
        setImportN(p.n)
        setImportTotal(p.total)
        setFilterTotal(p.total)
      })
      .on('broadcast', { event: 'filter_progress' }, ({ payload }) => {
        const p = payload as { filtered: number; total: number }
        setFilterStarted(true)
        setFilterN(p.filtered)
        setFilterTotal(p.total)
        setClassifyTotal(p.filtered)
      })
      .on('broadcast', { event: 'classify_progress' }, ({ payload }) => {
        const p = payload as { processed: number; total: number }
        setClassifyStarted(true)
        setClassifyN(p.processed)
        setClassifyTotal(p.total)
      })
      .on('broadcast', { event: 'room_created' }, ({ payload }) => {
        const p = payload as { count: number }
        setRoomsStarted(true)
        setRooms(p.count)
      })
      .on('broadcast', { event: 'processing_complete' }, () => {
        setComplete(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  function pct(n: number, total: number): number {
    if (total === 0) return 0
    return Math.min(100, Math.round((n / total) * 100))
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-10">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-foreground">Setting up your workspace</h1>
          <p className="text-sm text-muted-foreground">This takes a minute or two. Sit tight.</p>
        </div>

        <div className="space-y-6">
          <StageRow
            label="Importing emails"
            n={importN}
            total={importTotal}
            active
          />
          <StageRow
            label="Filtering noise"
            n={filterN}
            total={filterTotal}
            active={filterStarted}
          />
          <StageRow
            label="Classifying emails"
            n={classifyN}
            total={classifyTotal}
            active={classifyStarted}
          />
          <RoomsRow
            count={rooms}
            active={roomsStarted}
            pulsing={roomsPulsing}
          />
        </div>

        {complete && (
          <div className="space-y-4 pt-2 border-t border-border">
            <button
              onClick={() => routerRef.current.push('/')}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors animate-in fade-in duration-500"
            >
              Open your Croft
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StageRow({
  label,
  n,
  total,
  active,
}: {
  label: string
  n: number
  total: number
  active: boolean
}) {
  const percent = active ? Math.min(100, total > 0 ? Math.round((n / total) * 100) : 0) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={cn('text-sm', active ? 'text-foreground' : 'text-muted-foreground/40')}>
          {label}
        </span>
        {active && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {n} / {total}
          </span>
        )}
      </div>
      <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            active ? 'bg-foreground' : 'bg-muted-foreground/20',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function RoomsRow({
  count,
  active,
  pulsing,
}: {
  count: number
  active: boolean
  pulsing: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-2 w-2 rounded-full',
            pulsing ? 'bg-foreground animate-pulse' : active ? 'bg-foreground' : 'bg-muted-foreground/20',
          )}
        />
        <span className={cn('text-sm', active ? 'text-foreground' : 'text-muted-foreground/40')}>
          Rooms created
        </span>
      </div>
      {active && (
        <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
      )}
    </div>
  )
}
