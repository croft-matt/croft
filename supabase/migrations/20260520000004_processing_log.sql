-- Email processing log: append-only record of every AI call.
-- Used for cost estimation at onboarding and the user cost dashboard.
-- Never update or delete rows. No update or delete RLS policies.

create table email_processing_log (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  tier smallint not null check (tier in (1, 2, 3)),
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create index on email_processing_log(email_id);

alter table email_processing_log enable row level security;

create policy "workspace members can read own processing logs"
  on email_processing_log for select
  using (email_id in (
    select id from emails where workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  ));
