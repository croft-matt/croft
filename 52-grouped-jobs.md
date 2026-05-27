# Brief 52: Grouped Jobs

## Goal

When one email asks multiple people to do the same thing, Tier 3 correctly produces one job per owner. Two jobs with identical descriptions from the same source email look like a duplicate extraction error. They are not — but the UI needs to treat them as a single logical unit.

This brief does two things:

1. **Display collapse**: the Jobs tab renders one row per unique `(email_id, description)` pair, showing all owners on that row.
2. **Group close**: closing any job in a group closes all open siblings atomically. This applies to both manual close and AI-driven close via `closes_jobs`.

No schema changes. No new packages.

---

## Grouping key

Two jobs belong to the same group when both conditions are true:
- `email_id` is identical
- `description` is identical (exact string match)

The description equality check is case-sensitive. Tier 3 produces consistent casing within a single extraction so this is reliable.

---

## New helper: lib/jobs/close-group.ts

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Closes all open jobs that share the same source email and description.
// Called after any close operation — manual or AI-driven — to handle grouped jobs
// atomically. Safe to call even when a job has no siblings: the update matches
// zero rows and is a no-op.
// closedByEmailId: the email that triggered the close (null for manual no-email closes).
export async function closeJobGroup(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  emailId: string,
  description: string,
  closedAt: string,
  closedByEmailId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'closed',
      closed_at: closedAt,
      closed_by_email_id: closedByEmailId,
    })
    .eq('workspace_id', workspaceId)
    .eq('email_id', emailId)
    .eq('description', description)
    .eq('status', 'open')

  if (error) {
    console.error('closeJobGroup failed:', error.message)
  }
}
```

This closes ALL open matching jobs in one query, including the job that was just closed by the caller. Using `.eq('status', 'open')` makes it idempotent — re-running after one job is already closed is safe.

---

## Changes to lib/jobs/complete.ts

`completeJob` already marks the job closed. After the successful `.update({ status: 'closed' })` call, add:

```ts
// Close any sibling jobs from the same email with the same description.
await closeJobGroup(
  adminSupabase,
  job.workspace_id,
  job.email_id,
  job.description,
  now,
  null, // closed_by_email_id is null here: the close came from the user sending a reply,
        // not from an incoming email resolving it.
)
```

`job.description` is already fetched in the existing `.select('id, workspace_id, email_id, description, status')` query. No additional DB read needed.

Move the `now` constant to the top of the function:

```ts
const now = new Date().toISOString()
```

Replace the two inline `new Date().toISOString()` calls with `now`.

---

## Changes to lib/email/batch.ts — writeExtractionResults

The existing closes_jobs block closes jobs by ID. After that block succeeds, expand the close to siblings.

Replace the current closes_jobs block (around line 337) with:

```ts
const validClosesJobs = (extraction.closes_jobs ?? []).filter((id) => candidateJobIds.has(id))

if (validClosesJobs.length > 0) {
  const { error } = await supabase
    .from('jobs')
    .update({
      status: 'closed',
      closed_at: now,
      closed_by_email_id: emailId,
    })
    .in('id', validClosesJobs)
    .eq('status', 'open')

  if (error) {
    console.error(
      `writeExtractionResults: closes_jobs update failed for ${emailId}:`,
      error.message,
    )
  } else {
    // Fetch descriptions for closed jobs, then close any siblings.
    // Covers the case where one person's confirmation resolves the same ask for others.
    const { data: closedDetails } = await supabase
      .from('jobs')
      .select('email_id, description')
      .in('id', validClosesJobs)

    for (const job of closedDetails ?? []) {
      if (!job.description) continue
      await closeJobGroup(supabase, workspaceId, job.email_id, job.description, now, emailId)
    }
  }
}
```

Import `closeJobGroup` from `@/lib/jobs/close-group`.

---

## Changes to lib/jobs/actions.ts

A manual close without email (no send, just close) must also call `closeJobGroup`. Add:

```ts
export async function closeJob(jobId: string): Promise<JobActionResult> {
  await requireUser()
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, workspace_id, email_id, description, status')
    .eq('id', jobId)
    .single()

  if (!job) return { success: false, error: 'Job not found.' }
  if (job.status !== 'open') return { success: false, error: 'Job is already closed.' }

  await closeJobGroup(supabase, job.workspace_id, job.email_id, job.description, now, null)

  return { success: true }
}
```

This replaces any inline `.update({ status: 'closed' })` calls that exist in the job modal or elsewhere for the no-email close path. If that action does not yet exist, this is its implementation.

---

## UI changes: jobs-tab.tsx

### New type

Add `JobGroup` above the component:

```ts
interface JobGroup {
  // Stable key for React rendering.
  key: string
  description: string
  emailId: string
  // All job IDs in the group. Closing any one closes all.
  ids: string[]
  owners: (string | null)[]
  // Use the earliest created_at in the group for sort stability.
  updated_at: string
  due: string | null
  isOverdue: boolean
  source: 'extracted' | 'anticipated'
}
```

### Grouping function

Add before the component:

```ts
function groupOpenLoops(loops: OpenLoop[]): (OpenLoop | JobGroup)[] {
  const groupMap = new Map<string, OpenLoop[]>()

  for (const loop of loops) {
    const key = `${loop.email_id}::${loop.description}`
    const existing = groupMap.get(key) ?? []
    existing.push(loop)
    groupMap.set(key, existing)
  }

  const result: (OpenLoop | JobGroup)[] = []

  for (const [key, group] of groupMap) {
    if (group.length === 1) {
      result.push(group[0])
    } else {
      const earliest = group.reduce((a, b) =>
        new Date(a.updated_at) < new Date(b.updated_at) ? a : b,
      )
      result.push({
        key,
        description: group[0].description,
        emailId: group[0].email_id,
        ids: group.map((j) => j.id),
        owners: group.map((j) => j.owner ?? null),
        updated_at: earliest.updated_at,
        due: group[0].due ?? null,
        isOverdue: group.some((j) => !!j.due && new Date(j.due) < new Date()),
        source: group[0].source,
      })
    }
  }

  return result
}
```

### Component render

Replace the `allOpen.map` render with:

```ts
const grouped = groupOpenLoops(allOpen)

// in JSX:
{grouped.map((item) => {
  if ('ids' in item) {
    // Grouped row
    return (
      <GroupedJobRow
        key={item.key}
        group={item}
      />
    )
  }
  // Single job row — unchanged
  const isYours = item.owner != null && connectedSet.has(item.owner.toLowerCase())
  return (
    <JobRow
      key={item.id}
      job={{ ... }} // unchanged
      chaseCount={chaseCountMap.get(item.id)}
    />
  )
})}
```

Update the open count to reflect groups:

```ts
<span className="text-[13px] text-muted-foreground">{grouped.length}</span>
```

---

## New component: components/jobs/grouped-job-row.tsx

```ts
'use client'

import { useTransition } from 'react'
import { closeJob } from '@/lib/jobs/actions'
import { cn } from '@/lib/utils'
import type { JobGroup } from '@/components/room/jobs-tab'

interface GroupedJobRowProps {
  group: JobGroup
}

export function GroupedJobRow({ group }: GroupedJobRowProps) {
  const [isPending, startTransition] = useTransition()

  function handleClose() {
    startTransition(async () => {
      // Close any one job in the group. closeJob calls closeJobGroup internally,
      // which closes all siblings by (email_id, description).
      await closeJob(group.ids[0])
    })
  }

  const ownerDisplay = group.owners
    .filter(Boolean)
    .join(', ')

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm',
        isPending && 'opacity-50',
      )}
    >
      <button
        type="button"
        aria-label="Close group"
        onClick={handleClose}
        className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40 hover:bg-primary transition-colors cursor-pointer"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-snug">{group.description}</p>
        {ownerDisplay && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{ownerDisplay}</p>
        )}
      </div>
      {group.isOverdue && group.due && (
        <span className="shrink-0 text-xs text-destructive font-medium">
          {new Date(group.due).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}
```

Export `JobGroup` from `jobs-tab.tsx` so `GroupedJobRow` can import the type.

---

## Files changed

- `lib/jobs/close-group.ts` (new)
- `lib/jobs/actions.ts` (add closeJob)
- `lib/jobs/complete.ts` (call closeJobGroup after close)
- `lib/email/batch.ts` (expand closes_jobs to siblings)
- `components/room/jobs-tab.tsx` (grouping logic, export JobGroup type)
- `components/jobs/grouped-job-row.tsx` (new)

---

## What this is NOT

- Not a schema change. No new columns. No migration needed.
- Not changing the All Jobs view. That view intentionally shows individual jobs with your-court/their-court separation. The grouping is a room-level Jobs tab concern only.
- Not merging jobs in the database. Two jobs remain two rows. The grouping is query-time and display-only.
- Not snooze propagation. Snoozing one job in a group does not snooze siblings. That is a separate decision.
- Not changing how Tier 3 extracts jobs. The extraction is correct. This is entirely a presentation and close-path fix.
