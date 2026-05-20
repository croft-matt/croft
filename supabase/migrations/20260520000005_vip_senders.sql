-- VIP senders: email addresses that always score 8 or above in Tier 2,
-- regardless of email content.

create table vip_senders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email_address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique(workspace_id, email_address)
);

create index on vip_senders(workspace_id);

alter table vip_senders enable row level security;

create policy "workspace members can manage vip senders"
  on vip_senders for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
