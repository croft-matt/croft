# Croft — Claude Rules

## Migrations and type generation

Only Matt runs SQL migrations and `pnpm supabase gen types`.

Never run `supabase db push`, `supabase migration up`, or any equivalent migration command. Never run `pnpm supabase gen types` or `npx supabase gen types`. Write the migration file, tell Matt it's ready, and wait for him to apply it and regenerate types before proceeding with any code that depends on new columns or tables.

---

You are working on Croft, an AI-powered email intelligence layer for project-based professionals. Email arrives, gets classified into typed objects, filed into rooms, and surfaced through a cockpit view. The core value is turning an unstructured inbox into a structured, queryable workspace.

## Stack (NEVER deviate)
- Next.js 16 with App Router and TypeScript
- Tailwind CSS v4
- shadcn/ui components (in components/ui/)
- Supabase: Postgres, Auth, Storage, Realtime, pgvector (via @supabase/ssr)
- Stripe for billing
- Resend for transactional email AND inbound email receiving
- Anthropic SDK (@anthropic-ai/sdk) for AI inference
- Voyage AI (voyageai) for embeddings only
- Trigger.dev (@trigger.dev/sdk) for all background job processing
- Zod for runtime validation
- Lucide React for icons
- pnpm for package management
- Upstash Redis + @upstash/ratelimit for rate limiting
- Sentry (@sentry/nextjs) for error tracking
- Hosted on Vercel

## AI model selection (NEVER substitute)
- Tier 1 noise gate: claude-haiku-4-5-20251001 only
- Tier 2 urgency scan: claude-haiku-4-5-20251001 only
- Tier 3 full classification: claude-sonnet-4-6 only
- Embeddings: voyage-3-lite only
- Never use claude-opus for any automated processing path
- Never use any model not listed above without explicit instruction

## Email processing pipeline — hard rules

The pipeline has three AI tiers. Each tier has a fixed model, fixed trigger, and fixed output schema. Do not combine tiers. Do not reorder them.

Tier 1 (noise gate):
- Model: claude-haiku-4-5-20251001
- Trigger: fires immediately after email is stored, via Trigger.dev job
- Input: subject + first 300 words of body
- Output: { relevant: boolean, reason: string }
- If relevant is false: set processing_state to ignored and stop
- If relevant is true: set processing_state to urgency_scanned and enqueue Tier 2

Tier 2 (urgency scan):
- Model: claude-haiku-4-5-20251001
- Trigger: fires immediately after Tier 1 pass, via Trigger.dev job
- Input: subject + first 500 words of body + sender context
- Output: { urgency_score: 0-10, urgency_reason: string, requires_response: boolean, response_by: ISO date or null }
- After writing output: set processing_state to queued
- Broadcast Supabase Realtime event so UI updates urgency count immediately

Tier 3 (full classification):
- Model: claude-sonnet-4-6
- Trigger A: Trigger.dev scheduled job every 15 minutes, processes all emails with processing_state = queued
- Trigger B: on-demand server action when user opens an unprocessed email in the UI
- Prompt caching is MANDATORY (see caching rules below)
- Extraction is exhaustive: the prompt asks for every job in the email, not a single classification. One job per actionable item. The model self-checks before returning.
- The atomic unit is the job, not the email. Intent belongs on each job, not on the email. There is no intent column on the emails table.
- Output: subject_summary, room_suggestions, extraction_complete, confidence, jobs[], entities, closes_jobs
- Each job has: intent (REQUEST|DELIVER|CONFIRM|CHASE|QUERY|INTRODUCE), description, owner, due, confidence
- When extraction_complete is false or confidence is below 0.7: flag the email in the UI passively. Do not interrupt the user.
- Use Anthropic tool use to enforce output schema — do not parse free text

Embeddings (post-processing):
- Model: voyage-3-lite
- Trigger: separate low-priority Trigger.dev job, fires after Tier 3 completes
- Never block Tier 3 completion on embedding generation
- Store result in emails.embedding (pgvector, 1024 dimensions)

## Processing state machine

States progress in one direction only:
received -> urgency_scanned -> queued -> processing -> processed
                                                     -> failed
         -> ignored

Never skip states. Never go backwards. Never update processing_state to a prior state.

## Prompt caching rules

Prompt caching is the primary cost control mechanism. It is not optional.

Tier 3 system prompt is approximately 4,000 tokens. Without caching this costs $0.012 per call in system prompt tokens alone. With caching it costs $0.0012. At any meaningful user volume the difference is significant.

How to implement caching:

```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: TIER_3_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: [{ role: 'user', content: buildEmailContent(email) }],
  tools: [EXTRACTION_TOOL_SCHEMA]
})
```

TIER_3_SYSTEM_PROMPT must be a static constant in lib/ai/prompts.ts. Do not build it dynamically at runtime. Any runtime variation invalidates the cache for all in-flight calls.

Log cache_read_input_tokens and cache_creation_input_tokens from the response usage object to email_processing_log on every call. If cache_read_input_tokens is zero on the second email in a batch, caching is broken — investigate before continuing.

## Batch processing rules

Tier 3 batch jobs process emails sequentially within a workspace, not in parallel.

This is intentional and must not be changed. Sequential processing means each email in the batch reuses the same cached system prompt. Parallel processing would spawn independent calls that each start with a cold cache, destroying the cost saving.

The batch job query:
```sql
select * from emails
where processing_state = 'queued'
order by urgency_score desc, received_at asc
limit 50
```

Process one at a time. If a single email fails: log the error, set processing_state to failed, continue to the next email. Do not let one failure stop the batch.

## On-demand Tier 3 trigger

When a user opens an email and processing_state is not processed, fire Tier 3 immediately for that single email only.

Before firing: check processing_state is queued or urgency_scanned. If it is already processing, do nothing — a job is already running. If it is processed, do nothing.

The server action returns immediately. Do not make the user wait for the result. The raw email body is already stored and visible. Structured data populates via Realtime broadcast when the job completes.

## Webhook handler rules

The Resend inbound webhook handler does exactly three things:
1. Verify the webhook signature
2. Write the raw email to the emails table with processing_state = received
3. Return 200

Nothing else. No AI calls. No synchronous processing. No database reads beyond the insert. If the handler takes more than 500ms something is wrong.

Resend retries on non-200 responses. A slow or failing handler causes duplicate emails. The unique(workspace_id, message_id) constraint on the emails table is the dedup safety net — do not remove it.

## Token logging rules

Every AI call — Tier 1, 2, 3, and embeddings — must write a row to email_processing_log:

```ts
{
  email_id: uuid,
  tier: 1 | 2 | 3,
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_read_tokens: number,
  cache_write_tokens: number,
  duration_ms: number,
  error: string | null
}
```

email_processing_log is append-only. Never update or delete rows. It is the source of truth for cost estimation and the user cost dashboard.

## Hard rules (general)
- Use Server Components by default. Only use 'use client' when you need state, effects, or browser APIs.
- Server actions for mutations. Do not write API routes unless explicitly needed (webhooks, cron, Stripe callbacks, Resend inbound).
- Always use Supabase RLS. Never bypass with the service role key from client code.
- The service role key is only for server-side admin operations (webhooks, cron).
- All forms validate with Zod schemas in lib/validators/.
- Async APIs (cookies, params, searchParams) must be awaited in Next.js 16.
- Imports use the @/ alias. No relative imports across top-level folders.
- Next.js 16 root proxy file is proxy.ts and exports proxy (renamed from middleware.ts in Next.js 16).
- Validate every external URL before redirecting. Only allow relative paths starting with / and not //. Use safeRelativePath from lib/auth/helpers.ts.

## Code style
- TypeScript strict mode. No any. Use unknown and narrow.
- Named exports for components. Default exports only for Next.js page/layout/route files.
- Prefer functional components and hooks. No class components.
- Tailwind utility classes only. No custom CSS unless absolutely needed.
- Use cn() from @/lib/utils to merge classes.
- Use shadcn components from components/ui/.
- Use Lucide icons via import { IconName } from 'lucide-react'.

## Database conventions
- Tables: snake_case, plural (emails, workspaces, rooms, jobs)
- Columns: snake_case (created_at, workspace_id, urgency_score)
- TypeScript types come from generated lib/types/database.ts. Regenerate after every schema change with pnpm types:gen.
- Every user-facing table has RLS enabled. Every policy filters by workspace membership.
- New schema work goes in supabase/migrations/ as a timestamped SQL file and is committed.
- email_processing_log is append-only. Do not add update or delete policies to it.
- There is no intent column on the emails table. Intent lives on each job inside the extraction JSONB.

## Auth model
- Supabase Auth with magic link sign-in
- Every authenticated user has at least one workspace
- Workspace membership is the authorisation primitive
- Server actions and route handlers check auth.getUser() and verify workspace access
- Proxy file (proxy.ts) uses getUser() not getSession()
- Never use getSession() anywhere

## File organisation
- app/ for Next.js routes and pages
- components/ui/ for shadcn components
- components/ for application components, organised by feature
- lib/ for shared utilities, clients, types
- lib/ai/prompts.ts for all system prompts as static named constants
- lib/ai/tier1.ts for noise gate function
- lib/ai/tier2.ts for urgency scan function
- lib/ai/tier3.ts for full classification function
- lib/ai/embeddings.ts for Voyage AI embedding generation
- lib/email/ingest.ts for webhook handler and raw email storage
- lib/email/batch.ts for batch processing logic
- lib/supabase/ for Supabase client wrappers (server, admin, middleware)
- lib/validators/ for Zod schemas
- lib/types/ for TypeScript types (regenerated from Supabase)
- lib/ratelimit.ts for rate limiter instances
- lib/auth/helpers.ts for requireUser, getCurrentUser, safeRelativePath
- trigger/jobs/ for all Trigger.dev job definitions
- supabase/migrations/ for every schema change, committed to git
- public/ for static assets

## URL structure
- / is the authenticated cockpit dashboard (redirects to /home if not signed in)
- /home is the public marketing landing page
- /sign-in, /auth/callback, /auth/sign-out form the auth flow
- /rooms for room management
- /rooms/[id] for individual room view
- /emails for email list and search
- /jobs for open jobs
- /assets for extracted assets
- /contacts for extracted contacts
- /settings for workspace settings and cost configuration
- /api/email/inbound is the Resend inbound webhook endpoint
- /api/webhooks/stripe is the Stripe webhook endpoint
- No /app prefix on any routes. Keep URLs clean.

## Brand voice
- Short sentences. No corporate language.
- No marketing fluff in product copy. Plain English.
- Never use em-dashes in code, comments, or copy. They are an AI tell. Use commas, periods, colons, or parentheses.
- "Rooms" not "folders". "Jobs" not "tasks".
- Headlines should sound like a professional wrote them, not a SaaS founder.

## What NOT to do
- Do not run AI inference inside webhook handlers
- Do not process Tier 3 emails in parallel within a batch — sequential only
- Do not skip prompt caching on Tier 3 system prompts
- Do not use claude-opus for any automated processing
- Do not use any AI provider other than Anthropic and Voyage AI
- Do not update or delete rows in email_processing_log
- Do not store attachment files in the emails table — metadata only, files go to Supabase Storage
- Do not generate embeddings before Tier 3 completes
- Do not generate embeddings synchronously — always enqueue as a background job
- Do not skip states in the processing state machine
- Do not use getSession() anywhere — always getUser()
- Do not add an intent column to the emails table — intent is per-job inside extraction JSONB
- Do not add libraries not in the existing package.json without explicit instruction
- Do not switch to npm or yarn — pnpm only
- Do not write .css files — Tailwind utilities only
- Do not use Pages Router patterns — App Router only
- Do not invent table or column names — refer to generated types in lib/types/database.ts
- Do not disable RLS to make something work
- Do not add comments explaining what the code does — only add comments for WHY when non-obvious
- Do not use em-dashes in copy, code, or comments. Ever.
- Do not bypass prompt caching by building the system prompt dynamically at runtime
- Do not change the HNSW index type on emails.embedding
