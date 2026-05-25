import { createAdminClient } from '@/lib/supabase/admin'
import { classifyEmail } from '@/lib/email/batch'
import { broadcastToWorkspace } from '@/lib/realtime/broadcast'
import type { RateLimitHeaders } from '@/lib/ai/tier3'

export interface ProcessQueueResult {
  processed: number
  failed: number
  rateLimited: number
  remaining: number
}

const CLASSIFY_RUN_LIMIT = parseInt(process.env.CLASSIFY_RUN_LIMIT ?? '200', 10)
const CLASSIFY_CONCURRENCY = parseInt(process.env.CLASSIFY_CONCURRENCY ?? '3', 10)
// Pause before the next call when remaining input tokens drop below this floor.
// Default is twice a typical per-email input budget (roughly 8k tokens each).
const CLASSIFY_TOKEN_FLOOR = parseInt(process.env.CLASSIFY_TOKEN_FLOOR ?? '16000', 10)

function isRateLimitError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    return e['status'] === 429 || (typeof e['message'] === 'string' && e['message'].includes('rate_limit'))
  }
  return false
}

function msUntil(isoTimestamp: string | null): number {
  if (!isoTimestamp) return 10_000
  const delta = new Date(isoTimestamp).getTime() - Date.now()
  return Math.max(delta, 0)
}

export async function processQueuedEmails(): Promise<ProcessQueueResult> {
  const supabase = createAdminClient()

  // Load all queued emails up to the run limit.
  const { data: rows } = await supabase
    .from('emails')
    .select('id, workspace_id, thread_id, received_at, urgency_score')
    .eq('processing_state', 'queued')
    .limit(CLASSIFY_RUN_LIMIT)

  if (!rows || rows.length === 0) {
    const { count } = await supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('processing_state', 'queued')
    return { processed: 0, failed: 0, rateLimited: 0, remaining: count ?? 0 }
  }

  // Group by (workspace_id, thread_id). A null thread_id is its own singleton
  // keyed by the email id so unrelated emails are never merged.
  type EmailRow = NonNullable<typeof rows>[number]
  const groupMap = new Map<string, EmailRow[]>()

  for (const row of rows) {
    const key = row.thread_id
      ? `${row.workspace_id}:${row.thread_id}`
      : `singleton:${row.id}`
    const existing = groupMap.get(key)
    if (existing) {
      existing.push(row)
    } else {
      groupMap.set(key, [row])
    }
  }

  // Within each group sort oldest first (correctness: later emails in a thread
  // must not be classified before earlier ones reach processing_state=processed).
  for (const group of groupMap.values()) {
    group.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
  }

  // Sort groups by highest urgency_score descending, then earliest received_at ascending.
  const groups = [...groupMap.values()].sort((a, b) => {
    const aUrgency = Math.max(...a.map((e) => e.urgency_score ?? 0))
    const bUrgency = Math.max(...b.map((e) => e.urgency_score ?? 0))
    if (bUrgency !== aUrgency) return bUrgency - aUrgency
    const aEarliest = Math.min(...a.map((e) => new Date(e.received_at).getTime()))
    const bEarliest = Math.min(...b.map((e) => new Date(e.received_at).getTime()))
    return aEarliest - bEarliest
  })

  // Shared throttle state updated by each worker as calls complete.
  const throttle = {
    effectiveConcurrency: CLASSIFY_CONCURRENCY,
    lastHeaders: null as RateLimitHeaders | null,
  }

  let processed = 0
  let failed = 0
  let rateLimited = 0
  const batchTotal = rows.length

  // Work queue: workers pull from the front as they free up.
  const queue = [...groups]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const group = queue.shift()
      if (!group) break

      for (const email of group) {
        // Pause if the last seen token budget is below the safety floor.
        const headers = throttle.lastHeaders
        if (
          headers?.tokensRemaining !== null &&
          headers?.tokensRemaining !== undefined &&
          headers.tokensRemaining < CLASSIFY_TOKEN_FLOOR
        ) {
          const wait = msUntil(headers.tokensReset)
          if (wait > 0) {
            await new Promise((resolve) => setTimeout(resolve, wait))
          }
        }

        try {
          const result = await classifyEmail(email.id)
          if (result.rateLimitHeaders) {
            throttle.lastHeaders = result.rateLimitHeaders
          }
          processed++
          broadcastToWorkspace(email.workspace_id, 'classify_progress', {
            emailId: email.id,
            processed,
            total: batchTotal,
          }).catch((err: unknown) =>
            console.error(`process-queue: classify_progress broadcast failed:`, err),
          )
        } catch (err) {
          if (isRateLimitError(err)) {
            rateLimited++
            console.warn(`process-queue: rate limited on ${email.id}, resetting to queued`)

            await supabase
              .from('emails')
              .update({ processing_state: 'queued' })
              .eq('id', email.id)

            // Lower effective concurrency for the rest of this run, floor of 1.
            throttle.effectiveConcurrency = Math.max(throttle.effectiveConcurrency - 1, 1)

            // Sleep for the duration indicated by the API.
            const errObj = err as Record<string, unknown>
            const retryAfterSec =
              typeof errObj['retry_after'] === 'number'
                ? errObj['retry_after']
                : throttle.lastHeaders?.retryAfter ?? null
            const sleepMs = retryAfterSec !== null
              ? retryAfterSec * 1000
              : msUntil(throttle.lastHeaders?.tokensReset ?? null) || 10_000

            await new Promise((resolve) => setTimeout(resolve, sleepMs))

            // Skip remaining emails in this group so the thread ordering
            // stays intact on the next run (earlier emails will be retried first).
            break
          }

          // Any other error: classifyEmail already set the email to failed.
          failed++
          console.error(`process-queue: failed on ${email.id}:`, err)
          // Continue to the next email in the group.
        }
      }
    }
  }

  // Spawn workers up to effectiveConcurrency. Workers share the queue array
  // and self-schedule until it empties. Note: effectiveConcurrency may be
  // lowered mid-run by 429 handling, but workers already spawned keep running.
  const workerCount = Math.min(throttle.effectiveConcurrency, groups.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  const { count: remaining } = await supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('processing_state', 'queued')

  // When the queue is empty, check whether any emails are still in-flight
  // across all pipeline stages. If not, and if the workspace has not already
  // been marked complete, broadcast processing_complete and set the flag.
  // This fires at most once per workspace: subsequent runs skip it because
  // onboarding_complete will already be true.
  if ((remaining ?? 0) === 0 && rows.length > 0) {
    // Collect distinct workspace IDs from this batch.
    const workspaceIds = [...new Set(rows.map((r) => r.workspace_id))]

    for (const wsId of workspaceIds) {
      const { count: inFlight } = await supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId)
        .in('processing_state', ['received', 'urgency_scanned', 'queued', 'processing'])

      if ((inFlight ?? 1) > 0) continue

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('onboarding_complete')
        .eq('id', wsId)
        .single()

      if (workspace?.onboarding_complete) continue

      await supabase
        .from('workspaces')
        .update({ onboarding_complete: true })
        .eq('id', wsId)

      broadcastToWorkspace(wsId, 'processing_complete', {}).catch((err: unknown) =>
        console.error(`process-queue: processing_complete broadcast failed for ${wsId}:`, err),
      )
    }
  }

  return { processed, failed, rateLimited, remaining: remaining ?? 0 }
}
