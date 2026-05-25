-- RLS performance fix: auth_rls_initplan warnings.
--
-- Postgres re-evaluates auth.uid() for every row when it appears directly in
-- a USING clause. Wrapping it as (select auth.uid()) promotes it to a one-time
-- init-plan, which is dramatically cheaper at scale.
--
-- Affected policies are drop-and-recreated below. Policy semantics are unchanged.

-- workspaces
drop policy if exists "workspace members can read own workspace" on workspaces;
create policy "workspace members can read own workspace"
  on workspaces for select
  using (id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- workspace_members
drop policy if exists "users can read own memberships" on workspace_members;
create policy "users can read own memberships"
  on workspace_members for select
  using (user_id = (select auth.uid()));

-- emails
drop policy if exists "workspace members can read own emails" on emails;
create policy "workspace members can read own emails"
  on emails for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

drop policy if exists "workspace members can update own emails" on emails;
create policy "workspace members can update own emails"
  on emails for update
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- email_processing_log
drop policy if exists "workspace members can read own processing logs" on email_processing_log;
create policy "workspace members can read own processing logs"
  on email_processing_log for select
  using (email_id in (
    select id from emails where workspace_id in (
      select workspace_id from workspace_members where user_id = (select auth.uid())
    )
  ));

-- vip_senders
drop policy if exists "workspace members can manage vip senders" on vip_senders;
create policy "workspace members can manage vip senders"
  on vip_senders for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- rooms
drop policy if exists "workspace members can manage rooms" on rooms;
create policy "workspace members can manage rooms"
  on rooms for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- room_emails
drop policy if exists "workspace members can manage room emails" on room_emails;
create policy "workspace members can manage room emails"
  on room_emails for all
  using (room_id in (
    select id from rooms where workspace_id in (
      select workspace_id from workspace_members where user_id = (select auth.uid())
    )
  ));

-- jobs
drop policy if exists "workspace members can manage jobs" on jobs;
create policy "workspace members can manage jobs"
  on jobs for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- assets
drop policy if exists "workspace members can read assets" on assets;
create policy "workspace members can read assets"
  on assets for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- contacts
drop policy if exists "workspace members can manage contacts" on contacts;
create policy "workspace members can manage contacts"
  on contacts for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- email_accounts
drop policy if exists "workspace members can read own email accounts" on email_accounts;
create policy "workspace members can read own email accounts"
  on email_accounts for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- room_blocks
drop policy if exists "workspace members can manage room_blocks" on room_blocks;
create policy "workspace members can manage room_blocks"
  on room_blocks for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- contact_identities
drop policy if exists "workspace members manage contact_identities" on contact_identities;
create policy "workspace members manage contact_identities"
  on contact_identities for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));

-- contact_merge_candidates
drop policy if exists "workspace members manage contact_merge_candidates" on contact_merge_candidates;
create policy "workspace members manage contact_merge_candidates"
  on contact_merge_candidates for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = (select auth.uid())
  ));
