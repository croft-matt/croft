create table room_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  block_type text not null,
  status text not null check (status in ('active', 'dismissed')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, block_type)
);

create index on room_blocks(room_id, status);

alter table room_blocks enable row level security;

create policy "workspace members can manage room_blocks"
  on room_blocks for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
