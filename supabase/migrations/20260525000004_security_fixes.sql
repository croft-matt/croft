-- Security fixes.
--
-- 1. match_emails_for_context: change to security invoker and revoke execute from
--    authenticated. The function is called only through createAdminClient() in
--    lib/ai/reconciliation-context.ts, which bypasses RLS anyway. As security definer
--    it allowed any signed-in user to enumerate another workspace's email IDs and
--    semantic-distance scores via the REST RPC endpoint.
--
-- 2. Revoke INSERT and UPDATE on emails from authenticated. Every real write to the
--    emails table goes through the service-role admin client. The broad grant let any
--    user patch their own emails over REST and corrupt processing_state, extraction, etc.
--
-- 3. Scope the assets insert policy to service_role. The original policy had no TO
--    clause so it applied to PUBLIC. Harmless today (authenticated has no INSERT grant
--    on assets), but it is a latent foot-gun if a grant is ever added.

-- 1. Recreate match_emails_for_context as security invoker.
create or replace function match_emails_for_context(
  query_embedding vector(1024),
  p_workspace_id uuid,
  p_exclude_email_id uuid,
  match_count int default 20
)
returns table (
  email_id uuid,
  distance float8
)
language sql
stable
security invoker
as $$
  select
    id as email_id,
    (embedding <=> query_embedding) as distance
  from emails
  where
    workspace_id = p_workspace_id
    and id != p_exclude_email_id
    and embedding is not null
    and processing_state = 'processed'
  order by embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_emails_for_context from authenticated;
grant execute on function match_emails_for_context to service_role;

-- 2. Revoke unnecessary write grants on emails from authenticated.
revoke insert, update on emails from authenticated;

-- 3. Scope the assets insert policy to service_role.
drop policy if exists "service role can insert assets" on assets;
create policy "service role can insert assets"
  on assets for insert
  to service_role
  with check (true);
