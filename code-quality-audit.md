# Croft Code Quality & TypeScript Audit — Section 5

**Date:** 2026-05-27
**Scope:** TypeScript strictness, type cast patterns, environment variable handling, input validation coverage, SDK client instantiation, missing return types, file organisation
**Method:** Full source read — all findings reference specific files and line numbers

---

## Summary

The codebase is clean and consistent. Strict TypeScript is on, no `any` types appear in application code, and the patterns are followed uniformly. Most `as unknown as` casts are legitimate workarounds for gaps in Supabase's generated types (pgvector columns typed as `string`, JSONB columns typed as `Json`).

Three issues need attention before scale: no environment variable validation at startup means a missing secret fails silently or cryptically at runtime; input validation is incomplete across server actions; and SDK clients are instantiated in every module rather than shared. Everything else is low priority.

Eight findings: one high, two medium, five low.

---

## HIGH

### H1 — No environment variable validation at startup

There is no centralised env validation. The codebase has two inconsistent patterns:

**Non-null assertions** (`!`) — Supabase URLs, service role key, Redis tokens, Google OAuth credentials:
```ts
// lib/supabase/admin.ts
process.env.NEXT_PUBLIC_SUPABASE_URL!
process.env.SUPABASE_SERVICE_ROLE_KEY!
```

**No assertion, no fallback** — Anthropic API key, Resend API key, Voyage API key:
```ts
// lib/ai/tier1.ts, tier2.ts, tier3.ts, generate-room-summary.ts
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

Neither pattern validates at startup. If `ANTHROPIC_API_KEY` is missing on a fresh Vercel deployment, every AI call silently authenticates with `undefined` as the key. The Anthropic SDK will throw a 401 on the first real call — hours or days after deployment, in production, under real traffic, with no clear signal that a deploy-time misconfiguration caused it.

The `!` assertion is worse in a different way: TypeScript is told the value is definitely set, so the type system cannot warn when it is not. A missing `SUPABASE_SERVICE_ROLE_KEY` would produce a runtime `TypeError: Cannot read properties of undefined` deep inside the Supabase client, not a clear "missing environment variable" error.

**Fix required:**
Add a startup validation file — `lib/env.ts` — that reads all required env vars via Zod and throws with a clear message if any are missing:

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  EMAIL_TOKEN_ENCRYPTION_KEY: z.string().length(64),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

export const env = EnvSchema.parse(process.env)
```

Replace all `process.env.X` and `process.env.X!` usages with `env.X`. The parse call throws at module load time with a structured error listing every missing variable.

---

## MEDIUM

### M1 — Server actions have no input validation

`send.ts` (`lib/email/send.ts`) validates its inputs via Zod. That is the only server-side function that does. The remaining server actions and key library entry points accept unvalidated inputs:

- `sendReply` in `app/(app)/rooms/[id]/actions/send-reply.ts`: accepts `roomId`, `emailId`, `to[]`, `body`, `selectedAssetIds[]`, `closingJobIds[]` as plain strings/arrays. No length limits, no UUID format check, no email address format check on `to[]`.
- `fetchOpenJobsForThread` in the same file: accepts `emailId` and `excludeJobIds[]` as plain strings.
- `getProcessingStatus` in `app/(app)/onboarding/processing/actions.ts`: accepts `workspaceId` as a plain string passed directly into a Supabase query.
- Most query functions in `lib/queries/` accept `workspaceId`, `roomId`, `emailId` as `string` with no UUID validation.

The auth layer provides the real security boundary (RLS), so none of these are exploitable — a malformed UUID just returns no rows. But a UUID validation failure currently produces a confusing Supabase error rather than a clear "invalid input" response, and there is no protection against oversized inputs (a 10MB `body` string in `sendReply` would be sent to Resend).

**Fix required:**
Add Zod schemas to `sendReply` and other mutation server actions, matching the pattern already established in `send.ts`. At minimum: UUID validation on all ID fields, email format validation on address arrays, length cap on body text.

---

### M2 — SDK clients are duplicated across modules instead of shared

Six separate `new Anthropic(...)` instances are created at module level across the codebase:

```
lib/ai/tier1.ts
lib/ai/tier2.ts
lib/ai/tier3.ts
lib/ai/reply-suggestion.ts
lib/email/first-party-direct.ts
trigger/jobs/generate-room-summary.ts
```

Five separate `new Resend(...)` instances:

```
lib/email/fetch-body.ts
lib/email/confirmation.ts
lib/email/fetch-attachments.ts
lib/email/send.ts
lib/email/fetch-attachment-texts.ts
```

In a serverless/edge runtime each module is evaluated fresh per cold start, so these aren't actually shared across requests. But the pattern is inconsistent: Supabase clients use factory functions (`createAdminClient()`, `createClient()`) while AI and email clients are module-level singletons. If the Anthropic SDK ever adds connection pooling or retry state, six independent instances would not share that state. More immediately, the duplication means an API key rotation requires changing six files instead of one.

**Fix required:**
Extract shared clients into singleton modules, following the same factory pattern used for Supabase:

```ts
// lib/ai/client.ts
import Anthropic from '@anthropic-ai/sdk'
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

// lib/email/resend-client.ts
import { Resend } from 'resend'
export const resend = new Resend(env.RESEND_API_KEY)
```

Import from these modules everywhere instead of constructing inline. This also makes the env validation in H1 apply at a single point.

---

## LOW / INFORMATIONAL

### L1 — `tier2.ts` creates two admin Supabase clients per urgency scan

**File:** `lib/ai/tier2.ts`, lines 16, 36

`isVipSender` creates `createAdminClient()` at line 16. `runUrgencyScan` creates a second `createAdminClient()` at line 36. Both clients are used within a single function call. `createAdminClient()` is cheap (no connection is established until a query runs), but this is inconsistent with every other function in the codebase that creates one client and passes it through or uses it for all calls.

**Fix:** pass the supabase client from `runUrgencyScan` into `isVipSender` as a parameter.

---

### L2 — Pervasive `as unknown as` casts have no encapsulation

**Files:** throughout `lib/email/batch.ts`, `lib/ai/tier3.ts`, `lib/email/ingest.ts`, others

The same cast patterns repeat 20+ times across the codebase:

```ts
email.attachments as unknown as AttachmentMeta[]
embedding as unknown as string
result.extraction as unknown as Json
```

Each is a legitimate workaround for Supabase generated types: pgvector `embedding` is typed as `string`, JSONB columns are typed as `Json`, and the generated types do not know about `AttachmentMeta`. But the cast is scattered and undocumented. Any future schema change (e.g. if Supabase adds native pgvector types) requires hunting all 20+ callsites.

**Fix (low priority):** encapsulate the casts in narrow typed helpers:

```ts
// lib/types/casts.ts
export function asEmbeddingInsert(v: number[]): string {
  return v as unknown as string
}
export function asAttachments(v: unknown): AttachmentMeta[] {
  return (v as unknown as AttachmentMeta[] | null) ?? []
}
```

One place to update if Supabase improves its types.

---

### L3 — Several exported functions lack explicit return type annotations

**Files:** `lib/blocks/read-model.ts`, `lib/blocks/registry.ts`, `lib/queries/cockpit.ts`, `lib/queries/rooms.ts`, `lib/auth/helpers.ts`, others

Strict TypeScript infers return types, so this is not a correctness issue. But for public API functions, an explicit return type:
- Documents intent at the call site without needing to read the implementation
- Catches cases where a code change widens the return type unintentionally

Affected functions include `assembleReadModel`, `getRoomBlocks`, `resolveStack`, `resolveSuggestions`, `getProcessingCount`, `getAllActiveRooms`. One example of the current state:

```ts
export async function getRoomBlocks(roomId: string) {   // inferred, no annotation
```

vs. the preferred form:

```ts
export async function getRoomBlocks(roomId: string): Promise<RoomBlockRow[]> {
```

---

### L4 — `getReplysuggestion` has inconsistent casing

**File:** `app/(app)/rooms/[id]/actions/send-reply.ts`, line 122

The function is named `getReplysuggestion` (lowercase 's' in 'suggestion'). Every other function in the file and codebase uses consistent camelCase. This is a one-character rename from `getReplysuggestion` to `getReplySuggestion`.

---

### L5 — `first-party-direct.ts` is 784 lines and handles two distinct flows

**File:** `lib/email/first-party-direct.ts`

The file contains `handleProactiveCreation` (room setup from a user_direct email) and `handleCommand` (command execution when a room URL is detected in the body). These are two independent code paths with separate triggers, separate prompts, and separate error handling. They share only the entry-point detection logic (`containsRoomLink`).

At 784 lines it is the longest file in the codebase and is harder to read than the focused 200-400 line files in the rest of `lib/email/`. This is not a bug but will make future changes harder.

**Fix (low priority):** split into `first-party-create.ts` and `first-party-command.ts`, with `first-party-direct.ts` acting as a thin router that calls into one of the two.

---

## What looked good

- `strict: true` in `tsconfig.json` — the baseline is correct
- Zero `any` types in application code — every suppression uses `unknown` and narrows
- `Extraction`, `AttachmentMeta`, `ContextJob`, `ReconciliationContext` are well-modelled interfaces that represent the domain clearly
- `JobIntent` is a union type, not a string — exhaustive switch checking is possible
- `BlockDefinition<TData extends BlockData>` uses a generic correctly to enforce that `resolve` and `preview` operate on the same typed data shape
- `EXTRACTION_TOOL_SCHEMA` is a `const` assertion — no runtime mutation
- `sendEmail` in `lib/email/send.ts` validates all inputs via Zod and applies rate limiting — the pattern to replicate
- `resolveThreadId` and `parseFromAddress` are pure utility functions with clear single responsibilities
- `mergeFacts` in `lib/rooms/synthesise.ts` correctly models the update/restatement/correction semantics in the type system with `StoredFact`
- `normaliseName` and `normaliseLocalPart` in the contact matcher are pure functions, easy to unit test
- No relative imports across top-level folders — the `@/` alias is used consistently throughout

---

## Priority order for fixes

1. H1 — Add startup env validation via Zod — prevents silent misconfiguration failures in production
2. M1 — Add Zod input validation to `sendReply` and other mutation server actions
3. M2 — Consolidate Anthropic and Resend clients into shared singleton modules
4. L1 — Pass supabase client into `isVipSender` to avoid double instantiation in tier2
5. L2 — Encapsulate repeated `as unknown as` casts in typed helper functions
6. L3 — Add explicit return type annotations to exported functions
7. L4 — Rename `getReplysuggestion` to `getReplySuggestion`
8. L5 — Split `first-party-direct.ts` into two focused files
