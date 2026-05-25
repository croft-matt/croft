'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getProcessingStatus } from './actions'

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

  // Track complete in a ref so the polling interval can read it without
  // needing it as a dependency (avoids changing the deps array size).
  const completeRef = useRef(complete)
  completeRef.current = complete

  useEffect(() => {
    let active = true

    async function poll() {
      if (completeRef.current) return
      try {
        const status = await getProcessingStatus(workspaceId)
        if (!active) return

        setImportTotal(status.importTotal)
        setImportN(status.importN)
        setFilterTotal(status.importTotal)
        setFilterN(status.filterN)
        setClassifyTotal(status.filterN)
        setClassifyN(status.classifyN)
        setRooms(status.rooms)

        if (status.filterN > 0) setFilterStarted(true)
        if (status.classifyN > 0) setClassifyStarted(true)
        if (status.rooms > 0) setRoomsStarted(true)
        if (status.complete) setComplete(true)
      } catch (err) {
        console.error('[processing] poll failed:', err)
      }
    }

    // Poll immediately, then every 3 seconds until complete.
    poll()
    const interval = setInterval(() => {
      if (!active || completeRef.current) return
      poll()
    }, 3000)

    return () => {
      active = false
      clearInterval(interval)
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
