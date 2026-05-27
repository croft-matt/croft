# Croft Security Audit — Section 1: Security

**Date:** 2026-05-27
**Scope:** Auth, RLS, webhooks, rate limiting, API routes, storage, OAuth flow
**Method:** Full source read — no guessing, all findings reference specific files and line numbers

---

## Summary

The core security architecture is solid. Auth uses `getUser()` everywhere (never `getSession()`), `safeRelativePath()` is applied to all redirect targets, webhook signatures are verified before any processing, and the RLS initplan optimisation is applied to all high-traffic policies. The token encryption (`AES-256-GCM`) for Gmail OAuth credentials is correct.

Ten findings below, organised by severity. Four are high.

---

## HIGH

### H1 — `ai_usage_events` has no RLS and no grants

**File:** `supabase/migrations/20260526000006_ai_usage_events.sql`

The table is created with indexes but `alter table ai_usage_events enable row level security` is never called and no policies are defined. No grants are given to `authenticated` either.

Without RLS, any authenticated user can query all `ai_usage_events` rows across all workspaces via the Supabase REST API. This exposes usage metadata (token counts, event types, room IDs) for every workspace.

The `grants` migration (`20260520000009`) ran before this table existed, so `ai_usage_events` is not covered by it.

**Fix required:**
- Add `alter table ai_usage_events enable row level security`
- Add a select policy filtering by workspace membership
- Add `grant select on ai_usage_events to authenticated`
- Add `grant insert, select, update, delete on ai_usage_events to service_role`

---

### H2 — IDOR: asset fetch in `send-reply` not scoped to workspace

**File:** `app/(app)/rooms/[id]/actions/send-reply.ts`, lines 51–55

When building email attachments, assets are fetched via the service role client without a `workspace_id` filter:

```ts
const { data: selectedAssets } = await adminSupabase
  .from('assets')
  .select('id, filename, storage_path')
  .in('id', params.selectedAssetIds)
```

`selectedAssetIds` comes from the client. A user could supply asset IDs belonging to a different workspace and have those files fetched and attached to an outbound email. The workspace check on the room (`room.workspace_id`) does not protect the asset fetch.

**Fix required:**
Add `.eq('workspace_id', room.workspace_id)` to the admin asset query.

---

### H3 — XSS via inline file serving at Croft origin

**File:** `app/api/assets/[id]/content/route.ts`, lines 54–55

The content proxy route serves uploaded files inline from Croft's own origin:

```ts
const disposition = download
  ? `attachment; filename="${filename}"`
  : `inline; filename="${filename}"`
```

There is no MIME type allowlist. A user could upload an HTML or SVG file via either upload route, then request it via `/api/assets/[id]/content`. The route will serve it as `Content-Type: text/html` with `Content-Disposition: inline` — the browser will render it as a full page at `yourcroft.com`. Any scripts in the file execute in the user's authenticated session.

The upload routes (`app/api/assets/upload/route.ts` and `app/api/rooms/[id]/upload/route.ts`) derive `mime_type` from `file.type`, which is client-controlled and not validated against actual file content.

**Fix required:**
Either (a) add a MIME type allowlist for inline serving and force `attachment` disposition for HTML/SVG/JS, or (b) rewrite content-type to `application/octet-stream` for all inline serves. Option (a) is better UX.

Safe inline types: `image/*`, `application/pdf`, `video/*`, `audio/*`.
Force download for: `text/html`, `image/svg+xml`, `text/javascript`, `application/javascript`, and any unknown type.

---

### H4 — `sendRatelimit` is defined but never applied

**File:** `lib/ratelimit.ts`, lines 18–22; `app/api/send-nudge/route.ts`

`sendRatelimit` (60 sends/hour/workspace) is declared but never imported or applied anywhere. The `/api/send-nudge` route has no rate limiting, meaning a user can send unlimited outbound emails via Resend. This is a potential spam vector and could exhaust your Resend sending quota.

**Fix required:**
Import `sendRatelimit` in `/api/send-nudge/route.ts` and apply it keyed on `workspaceId` before the Resend call. Also consider applying it in `lib/email/send.ts` so any future send path is covered.

---

## MEDIUM

### M1 — No rate limiting on `/api/ask` or `/api/nudge`

**Files:** `app/api/ask/route.ts`, `app/api/nudge/route.ts`

Both routes make AI calls and have no rate limiting. `/api/nudge` uses `claude-sonnet-4-6` (more expensive). A user could hammer either endpoint to drive up AI costs. The workspace membership check is present, but there is no per-user or per-workspace call frequency limit.

**Fix required:**
Add a rate limiter to `lib/ratelimit.ts` for interactive AI calls (e.g., 20 requests/minute/workspace) and apply it in both routes.

---

### M2 — Inbound webhook rate limit is keyed on IP, not workspace

**File:** `app/api/email/inbound/route.ts`, lines 20–24; `lib/ratelimit.ts`, lines 11–15

```ts
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
const { success } = await inboundRatelimit.limit(ip)
```

Resend sends all webhook requests from a fixed set of Resend IPs. This means every inbound email from every Croft workspace shares the same rate limit bucket. At scale, legitimate inbound emails will start returning 429s, causing Resend to retry and potentially triggering the duplicate detection path.

**Fix required:**
Key on the resolved `workspace_id` instead of IP. Parse the recipient address from the raw payload headers first (before full Zod validation), and key the limiter on workspace. Alternatively, remove the IP-based rate limit for the inbound path (it offers no meaningful protection since the signature verification already rejects unsigned requests) and rely on the `unique(workspace_id, message_id)` dedup constraint instead.

---

### M3 — Content-Disposition header injection via unsanitised filename

**File:** `app/api/assets/[id]/content/route.ts`, lines 50–55

```ts
const filename = asset.filename ?? 'file'
const disposition = download
  ? `attachment; filename="${filename}"`
  : `inline; filename="${filename}"`
```

`filename` is stored as-is from the upload. A filename containing `"` breaks the header format. A filename like `file", x-custom-header: injected` could theoretically inject additional headers depending on the HTTP library's handling.

**Fix required:**
Sanitise the filename before building the header. Either escape double quotes (`filename.replace(/"/g, '\\"')`) or use RFC 5987 encoding (`filename*=UTF-8''${encodeURIComponent(filename)}`). The RFC 5987 form is preferred and handles non-ASCII characters correctly.

---

### M4 — Gmail callback does not verify session user matches PKCE-stored userId

**File:** `app/auth/gmail/callback/route.ts`, lines 39–56

The callback confirms the user is authenticated and retrieves `userId` from the PKCE state in Redis, but never asserts that the two are the same:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) { ... }

const { verifier, workspaceId, userId, ... } = stored
// userId from Redis is used to upsert email_accounts, but never compared to user.id
```

The state token is 128-bit random (cryptographically unguessable), so this is low-exploitability in practice. However, the defensive check is one line and eliminates a class of attack entirely.

**Fix required:**
Add after the Redis `get`:
```ts
if (stored.userId !== user.id) {
  return NextResponse.redirect(`${errorUrl}invalid_state`)
}
```

---

## LOW / INFORMATIONAL

### L1 — `notifications` RLS policies use bare `auth.uid()` instead of `(select auth.uid())`

**File:** `supabase/migrations/20260527000002_notifications.sql`, lines 20–30

The `notifications` table was created after the `rls_perf_initplan` migration (`20260525000006`) ran, so its policies were not updated with the init-plan optimisation. Under the current form, Postgres re-evaluates `auth.uid()` for every row scanned. At low volume this is invisible; at scale it becomes measurable.

**Fix required:**
Add a follow-up migration that drops and recreates the two `notifications` policies using `user_id = (select auth.uid())`.

---

### L2 — Upload routes do not validate declared MIME type against actual file content

**Files:** `app/api/assets/upload/route.ts`, `app/api/rooms/[id]/upload/route.ts`

`file.type` is browser-provided and can be anything. The routes trust it entirely for both storage upload (`contentType: file.type`) and the `mime_type` database column. A user can upload an HTML file with `Content-Type: image/png` or vice versa.

This is informational given that files are served via signed URLs and the content proxy (once H3 is fixed) will enforce a MIME allowlist. Server-side magic-byte sniffing would fully close this gap but is a heavier lift.

**Current risk:** Low after H3 is resolved. Flag to revisit if file processing (e.g., text extraction) is expanded.

---

## What looked good

These areas were checked and are clean:

- `getUser()` used everywhere — `getSession()` never appears in the codebase
- `safeRelativePath()` applied to every redirect from user input (`auth/callback`)
- Webhook signature verification is correct on both Resend and Stripe handlers, and runs before any other processing
- Service role key is never imported in browser-side code (`lib/supabase/client.ts` uses anon key only)
- AES-256-GCM with random IVs and auth tags for Gmail token encryption — implementation in `lib/crypto/tokens.ts` is correct
- PKCE flow for Gmail OAuth is correctly implemented (verifier stored in Redis with 10-minute TTL, deleted on first use)
- `create_workspace_with_owner` RPC is `security definer` with `set search_path = ''` and restricted to `service_role` only
- `match_emails_for_context` is `security invoker` and restricted to `service_role`
- `rls_auto_enable()` execute rights revoked from `anon` and `authenticated`
- All core tables have RLS enabled and policies present (except `ai_usage_events` — see H1)
- `email_processing_log` correctly has no insert/update/delete policies for `authenticated` — append-only via service role only
- `unique(workspace_id, message_id)` dedup constraint on emails is the correct safety net for Resend retries
- No inline AI calls in the webhook handler
- `x-forwarded-for` parsed correctly (first IP only, trimmed) in the inbound handler

---

## Priority order for fixes

1. H1 — RLS on `ai_usage_events` (migration, quick)
2. H3 — XSS via inline file serving (route handler change, medium effort)
3. H2 — IDOR in send-reply asset fetch (one line fix)
4. H4 — Apply `sendRatelimit` in send-nudge (quick import + call)
5. M1 — Rate limit `/api/ask` and `/api/nudge`
6. M3 — Sanitise Content-Disposition filename
7. M4 — Assert session user matches PKCE userId in Gmail callback
8. M2 — Rethink inbound webhook rate limit key
9. L1 — `notifications` init-plan RLS migration
