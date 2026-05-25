-- Sweeper and auth reliability prerequisites.
--
-- 1. processing_attempts: integer column on emails used by the sweeper to bound
--    the number of times a failed email is retried before it stays failed. The
--    sweeper resets failed emails to queued and increments this counter; it will
--    not retry an email that has already failed 3 times.
--
-- 2. GIN indexes on to_addresses and cc_addresses: the contact matcher's
--    checkCoOccurrence issues jsonb containment queries against these columns.
--    Without indexes each query is a full table scan; with GIN (jsonb_path_ops)
--    each query is an index lookup. Required before the matcher optimization in
--    the next code commit or the O(n^2) scan pattern continues during imports.
--
-- 3. create_workspace_with_owner: atomic function that inserts a workspace and
--    its owner membership in a single transaction. Used by the auth callback to
--    eliminate the orphaned-workspace failure mode where the workspace row lands
--    but the membership insert fails, leaving the user with a broken account.

-- 1. processing_attempts column.
alter table emails
  add column if not exists processing_attempts integer not null default 0;

-- 2. GIN indexes for jsonb containment queries in the contact matcher.
create index if not exists emails_to_addresses_gin
  on emails using gin (to_addresses jsonb_path_ops);

create index if not exists emails_cc_addresses_gin
  on emails using gin (cc_addresses jsonb_path_ops);

-- 3. Atomic workspace + owner membership creation.
-- Called from app/auth/callback/route.ts on first sign-in.
-- Rolls back both inserts if either fails, preventing orphaned workspace rows.
create or replace function create_workspace_with_owner(
  p_workspace_id uuid,
  p_name text,
  p_receiving_address text,
  p_croft_email_address text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  insert into workspaces (id, name, receiving_address, croft_email_address)
  values (p_workspace_id, p_name, p_receiving_address, p_croft_email_address);

  insert into workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, p_user_id, 'owner');
end;
$$;

-- Only the service role calls this function (server-side auth callback).
revoke execute on function create_workspace_with_owner from public, authenticated;
grant execute on function create_workspace_with_owner to service_role;
