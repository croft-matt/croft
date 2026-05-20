-- Workspaces: the top-level organisational unit.
-- Every user belongs to at least one workspace.
-- Workspace membership is the authorisation primitive for all RLS policies.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table workspaces enable row level security;

create policy "workspace members can read own workspace"
  on workspaces for select
  using (id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

-- Workspace members: links auth users to workspaces with a role.
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create index on workspace_members(user_id);
create index on workspace_members(workspace_id);

alter table workspace_members enable row level security;

create policy "users can read own memberships"
  on workspace_members for select
  using (user_id = auth.uid());

create policy "workspace owners can manage members"
  on workspace_members for all
  using (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = auth.uid() and role = 'owner'
    )
  );
