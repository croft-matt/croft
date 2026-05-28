alter table ai_usage_events enable row level security;

-- Users can read usage events for their own workspace (cost dashboard).
create policy "workspace members can read own ai usage events"
  on ai_usage_events for select
  using (workspace_id in (
    select workspace_id from workspace_members
    where user_id = (select auth.uid())
  ));

-- logAiUsage in lib/command-palette/usage.ts uses createClient() (authenticated role),
-- so inserts come through RLS. Enforce that user_id matches the caller to prevent
-- logging events under another user's ID.
create policy "workspace members can insert own ai usage events"
  on ai_usage_events for insert
  with check (
    workspace_id in (
      select workspace_id from workspace_members
      where user_id = (select auth.uid())
    )
    and user_id = (select auth.uid())
  );

grant select, insert on ai_usage_events to authenticated;
grant insert, select, update, delete on ai_usage_events to service_role;
