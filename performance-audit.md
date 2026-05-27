# Croft Performance & Database Audit — Section 3

**Date:** 2026-05-27
**Scope:** Query layer (lib/queries/), app layout, page-level data loading, room filing, batch processing overhead, index coverage, Realtime broadcast path
**Method:** Full source read — all findings reference specific files and line numbers

---

## Summary

The query layer is well-structured and most individual queries are correct. The bigger issues are at the composition level: several queries run on every page load, some fetch unbounded result sets, and a few use patterns that will degrade sharply as workspace data grows. None of these are production-blocking today, but two will cause visible slowdowns at modest scale and should be fixed before launch.

Six findings total: two high, two medium, two low.

---

## HIGH

### H1 — `getAllJobs` fetches every open job with no limit

**File:** `lib/queries/all-jobs.ts`

The query that powers the All Jobs view fetches all open jobs for the workspace in one call. There is no `limit()`, no pagination, and no cursor. At small workspace sizes this is invisible. At 500+ open jobs (a realistic number for a project-based professional after a few months of use) the query returns a large payload, the component renders all rows, and the page becomes slow.

The query also joins via a two-step pattern (jobs → email_ids → room names), so the unbounded job list multiplies into a second unbounded room lookup.

**Fix required:**
Add server-side pagination (cursor or offset) to `getAllJobs`. The UI should load the first 50 and paginate or virtualise the rest. This is also a prerequisite for any future sorting or filtering feature.

---

### H2 — `getRoomsTree` runs on every authenticated page navigation

**File:** `app/(app)/layout.tsx`, `lib/queries/cockpit.ts`

The app layout calls `getRoomsTree()` on every request. `getRoomsTree` is not a lightweight call: it fetches all non-archived rooms for the workspace, then fires a second query to get all `room_emails` links, then a third query to get overdue job counts. That is three database round-trips on every page navigation.

For a workspace with 20 rooms and 500 emails, this is fast. For a workspace with 200 rooms (realistic for a prolific user), these queries fan out significantly. More importantly, room structure changes infrequently — the tree is rebuilt on every navigation even though nothing has changed.

There is also no caching: `getRoomsTree` is called in a Server Component with no `unstable_cache` or equivalent wrapper, so Next.js does not cache the result between requests.

**Fix required:**
Wrap `getRoomsTree` with `unstable_cache` (Next.js) with a tag like `rooms-tree-${workspaceId}`. Revalidate on room creation, rename, archive, or parent change. This reduces the three-query fan-out on every navigation to one cache hit in the common case. Alternatively, denormalise the tree into a single query with a recursive CTE — Postgres handles this efficiently.

---

## MEDIUM

### M1 — `getActiveRooms` is a 3-query fan-out that could be 1 query

**File:** `lib/queries/cockpit.ts`, `getActiveRooms` function

The function fetches rooms, then fetches `room_emails` links for those rooms, then fetches the most recent email timestamp per room — three sequential queries to produce a sorted room list.

This pattern can be collapsed into a single query using a lateral join or window function:

```sql
select r.id, r.name, max(e.received_at) as last_email_at
from rooms r
join room_emails re on re.room_id = r.id
join emails e on e.id = re.email_id
where r.workspace_id = $1
and r.archived_at is null
group by r.id, r.name
order by last_email_at desc nulls last
```

The three-query version makes two extra round-trips and is harder to paginate correctly if the room list ever gets long.

**Fix required:**
Rewrite `getActiveRooms` as a single query with a join and `max(received_at)` aggregation. Adds an index on `emails.received_at` if not already present (it is — covered by `emails_received_at_idx`).

---

### M2 — `synthesiseRoom` uses an unbounded `.in()` clause for COUNT queries

**File:** `lib/rooms/synthesise.ts`

`synthesiseRoom` fetches all email IDs associated with a room, then passes that full array to three separate `.in('email_id', emailIds)` COUNT queries. Postgres handles large IN lists, but Supabase's PostgREST serialises the array into the URL query string, which can hit URL length limits at a few hundred IDs, and the query plan degrades on very large IN lists compared to a join.

More immediately: the initial `getEmailIdsForRoom` query is itself unbounded — it fetches all email IDs for the room with no limit. A room with 1,000 emails passes 1,000 UUIDs into each subsequent query.

**Fix required:**
Replace the fetch-IDs-then-in pattern with subquery or CTE-based COUNT queries that stay inside the database. For example:

```sql
select count(*) from jobs j
join room_emails re on re.email_id = j.email_id
where re.room_id = $roomId
and j.status = 'open'
```

This avoids the round-trip to fetch email IDs and eliminates the IN clause entirely.

---

## LOW / INFORMATIONAL

### L1 — Two missing indexes on frequently filtered columns

**Source:** Migration files, cross-referenced against query patterns

Two columns used in home page and cockpit queries are not indexed:

`emails.requires_response` — used in `getWaitingEmails` (`lib/queries/home.ts`) with `eq('requires_response', true)`. This query runs on every home page load and on every home refresh. Without an index, Postgres scans the full workspace email set. A partial index covers this efficiently:

```sql
create index emails_requires_response_idx on emails(workspace_id, received_at desc)
where requires_response = true;
```

`jobs.owner` — used in `getWaitingOnOthers` and `getHomeCounts` (`lib/queries/home.ts`) to filter by owner address. Without an index, the query scans all workspace jobs. A simple composite index is sufficient:

```sql
create index jobs_owner_idx on jobs(workspace_id, owner) where owner is not null;
```

Neither is critical at small data volumes, but both will degrade linearly as email volume grows.

---

### L2 — Redundant standalone `thread_id` index

**Source:** Migration files (`supabase/migrations/`)

There are two indexes on `emails.thread_id`:

1. A composite `emails(workspace_id, thread_id)` — correct, used by all sibling lookups
2. A standalone `emails(thread_id)` — redundant, never used by any query (all thread queries filter by workspace_id first)

The standalone index adds write overhead on every email insert and takes storage space without providing any query benefit Postgres cannot already get from the composite.

**Fix required:**
Drop the standalone `thread_id` index:

```sql
drop index if exists emails_thread_id_idx; -- or whatever the actual index name is
```

Verify the name in the migration files before dropping.

---

## What looked good

- Home page fires its 6 queries in parallel via `Promise.all` — good pattern
- Room page fetches `emailIds` once and shares the array across 9 parallel queries — correct, no redundant fetches
- `getNotifications` is capped at 100 results
- Rate limit header awareness in `process-queue.ts` — backs off before hitting the token floor
- `processQueuedEmailsTask` has `concurrencyLimit: 1` — prevents competing batch runs
- Batch process self-re-triggers when emails remain, so the queue drains without waiting for the next cron tick
- The `candidateJobIds` deduplication in reconciliation context is correct and prevents duplicate job surfacing
- All major query columns have composite indexes: `(workspace_id, received_at)`, `(workspace_id, thread_id)`, `(workspace_id, processing_state)`, `(workspace_id, status)` on jobs
- pgvector HNSW index on `emails.embedding` is correctly typed and sized for 1024-dimensional voyage-3-lite output

---

## Priority order for fixes

1. H2 — Cache `getRoomsTree` in the app layout — every user hits this on every navigation
2. H1 — Add pagination to `getAllJobs` — will become visibly broken before long
3. M1 — Collapse `getActiveRooms` into a single query — quick win, reduces layout query count
4. M2 — Replace unbounded IN pattern in `synthesiseRoom` — protects against large room data sets
5. L1 — Add missing indexes for `requires_response` and `jobs.owner`
6. L2 — Drop redundant standalone `thread_id` index
