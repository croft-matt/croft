create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null check (type in ('job_created', 'job_updated', 'job_closed', 'email_received')),
  summary text not null,
  room_id uuid references rooms(id) on delete set null,
  email_id uuid references emails(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_workspace_created_idx on notifications(workspace_id, created_at desc);
create index notifications_workspace_unread_idx on notifications(workspace_id, read_at) where read_at is null;

alter table notifications enable row level security;

-- Workspace members can read and mark-read their own notifications.
create policy "workspace members can read own notifications"
  on notifications for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

create policy "workspace members can update own notifications"
  on notifications for update
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

-- Pipeline writes via admin/service role — no insert policy needed for anon/authed roles.

-- Enable Realtime so the client can subscribe to new rows.
alter publication supabase_realtime add table notifications;
