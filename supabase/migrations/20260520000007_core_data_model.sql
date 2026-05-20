-- Core data model: rooms, room_emails, jobs, assets, contacts.
-- These tables store the structured intelligence Croft builds on top of emails.
-- Room membership for jobs and assets flows through room_emails only.
-- There is no room_jobs or room_assets join table.

-- Rooms: workspace-scoped project containers.
-- archived_at is a soft delete. Filter with "where archived_at is null" for active rooms.
-- room_data accumulates structured facts about the project over time.
create table rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_room_id uuid references rooms(id) on delete set null,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  room_data jsonb not null default '{}',
  progress_total integer not null default 0,
  progress_closed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on rooms(workspace_id, parent_room_id);
create index on rooms(workspace_id, archived_at);

alter table rooms enable row level security;

create policy "workspace members can manage rooms"
  on rooms for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

-- Room-email join: one email can belong to multiple rooms simultaneously.
-- source records whether the email was filed by the user or by Croft AI suggestion.
create table room_emails (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  email_id uuid not null references emails(id) on delete cascade,
  source text not null default 'user'
    check (source in ('user', 'ai')),
  created_at timestamptz not null default now(),
  unique(room_id, email_id)
);

create index on room_emails(room_id);
create index on room_emails(email_id);

alter table room_emails enable row level security;

create policy "workspace members can manage room emails"
  on room_emails for all
  using (room_id in (
    select id from rooms where workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  ));

-- Jobs: one row per actionable item extracted from an email.
-- Intent lives here, not on the email. One email produces multiple jobs with different intents.
-- CHASE jobs link to their parent REQUEST via parent_job_id.
-- Auto-close: when an email resolves a job, closed_by_email_id records which email did it.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email_id uuid not null references emails(id) on delete cascade,
  intent text not null
    check (intent in ('REQUEST', 'DELIVER', 'CONFIRM', 'CHASE', 'QUERY', 'INTRODUCE')),
  description text not null,
  owner text,
  due timestamptz,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  confidence float not null,
  parent_job_id uuid references jobs(id) on delete set null,
  closed_at timestamptz,
  closed_by_email_id uuid references emails(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on jobs(workspace_id, status);
create index on jobs(workspace_id, intent, status);
create index on jobs(email_id);
create index on jobs(parent_job_id);

alter table jobs enable row level security;

create policy "workspace members can manage jobs"
  on jobs for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

-- Assets: attachment metadata extracted from emails.
-- Files live in Supabase Storage. storage_path must be set at insert time.
-- likely_type is never hardcoded: it emerges from Tier 3 context as plain text.
-- Inserts come from server-side processing only (service role).
create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email_id uuid not null references emails(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  likely_type text,
  confidence float,
  status text not null default 'received'
    check (status in ('received', 'sent', 'submitted', 'accepted', 'not_reviewed')),
  status_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index on assets(workspace_id, likely_type);
create index on assets(email_id);

alter table assets enable row level security;

create policy "workspace members can read assets"
  on assets for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

create policy "service role can insert assets"
  on assets for insert
  with check (true);

-- Contacts: every person or entity seen in the workspace email stream.
-- Workspace-scoped, not room-scoped. Rooms a contact appears in are derived by joining
-- through emails and room_emails.
-- Upsert on every email: insert if new, update last_seen_at and fill null fields if existing.
-- Never overwrite existing non-null name, role, or organisation with new AI-extracted values.
create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email_address text not null,
  name text,
  role text,
  organisation text,
  phone text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, email_address)
);

create index on contacts(workspace_id, email_address);
create index on contacts(workspace_id, organisation);

alter table contacts enable row level security;

create policy "workspace members can manage contacts"
  on contacts for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
