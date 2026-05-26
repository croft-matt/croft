create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('ask', 'nudge')),
  model_used text not null,
  input_tokens int,
  output_tokens int,
  room_id uuid references rooms(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_usage_events_workspace_id_idx on ai_usage_events(workspace_id);
create index ai_usage_events_created_at_idx on ai_usage_events(created_at);
