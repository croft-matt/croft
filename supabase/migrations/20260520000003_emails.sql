-- Emails table: the core of Croft's data model.
-- Stores raw email content and all AI processing outputs.
-- The processing_state column drives the pipeline state machine.
-- Intent does NOT live here — it lives on each job inside the extraction JSONB.

create table emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id text not null,
  from_address text not null,
  from_name text,
  to_addresses jsonb not null default '[]',
  cc_addresses jsonb not null default '[]',
  subject text,
  body_text text,
  body_html text,
  received_at timestamptz not null default now(),
  processing_state text not null default 'received'
    check (processing_state in (
      'received',
      'urgency_scanned',
      'queued',
      'processing',
      'processed',
      'failed',
      'ignored'
    )),
  -- Tier 2 urgency scan outputs
  urgency_score smallint check (urgency_score >= 0 and urgency_score <= 10),
  urgency_reason text,
  requires_response boolean,
  response_by timestamptz,
  -- Tier 3 full classification outputs
  subject_summary text,
  extraction jsonb,
  extraction_complete boolean,
  -- Attachment metadata only — files go to Supabase Storage
  attachments jsonb not null default '[]',
  -- Voyage AI embedding (post-processing, non-blocking)
  embedding vector(1024),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Dedup constraint: same message cannot be ingested twice per workspace
  unique(workspace_id, message_id)
);

create index on emails(workspace_id, processing_state);
create index on emails(workspace_id, urgency_score desc);
create index on emails(workspace_id, received_at desc);
create index on emails using hnsw (embedding vector_cosine_ops);

alter table emails enable row level security;

create policy "workspace members can read own emails"
  on emails for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

create policy "workspace members can update own emails"
  on emails for update
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
