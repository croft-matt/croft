-- RLS performance fix: apply init-plan optimisation to notifications policies.
--
-- The notifications table was created after 20260525000006_rls_perf_initplan.sql
-- ran, so its policies use bare auth.uid() which Postgres re-evaluates per row.
-- Wrapping as (select auth.uid()) promotes it to a one-time init-plan.

drop policy if exists "workspace members can read own notifications" on notifications;
create policy "workspace members can read own notifications"
  on notifications for select
  using (workspace_id in (
    select workspace_id from workspace_members
    where user_id = (select auth.uid())
  ));

drop policy if exists "workspace members can update own notifications" on notifications;
create policy "workspace members can update own notifications"
  on notifications for update
  using (workspace_id in (
    select workspace_id from workspace_members
    where user_id = (select auth.uid())
  ));
