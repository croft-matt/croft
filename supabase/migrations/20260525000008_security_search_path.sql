-- Security fixes: mutable search_path and rls_auto_enable exposure.
--
-- 1. create_workspace_with_owner: add SET search_path = '' and fully-qualify
--    all table references in the body. Grants are unchanged (service_role only).
--
-- 2. match_emails_for_context: pin search_path to 'public' rather than '' because
--    the <=> vector operator is registered in public and requires it in scope.
--    Empty search_path works for create_workspace_with_owner (pure plpgsql, fully
--    qualified tables) but breaks operator resolution in SQL functions. Using
--    'public' still satisfies the linter and is safe here since the function is
--    security invoker — it runs with the caller's permissions regardless.
--
-- 3. rls_auto_enable: a SECURITY DEFINER function executable by anon and
--    authenticated via the REST API. Revoke both. Not created by any migration
--    so no recreate is needed — just a revoke.
--
-- Not addressed here:
--   - vector extension in public schema: moving a live extension schema is
--     destructive (requires DROP EXTENSION and loss of all vector columns).
--     Supabase recommends doing this only at project creation. Flag to revisit
--     on the next clean environment.
--   - Leaked password protection: dashboard toggle, not a SQL setting.
--     Auth > Providers > Email > Enable leaked password protection.

-- 1. create_workspace_with_owner
create or replace function public.create_workspace_with_owner(
  p_workspace_id uuid,
  p_name text,
  p_receiving_address text,
  p_croft_email_address text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspaces (id, name, receiving_address, croft_email_address)
  values (p_workspace_id, p_name, p_receiving_address, p_croft_email_address);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, p_user_id, 'owner');
end;
$$;

revoke execute on function public.create_workspace_with_owner from public, authenticated;
grant execute on function public.create_workspace_with_owner to service_role;

-- 2. match_emails_for_context
create or replace function public.match_emails_for_context(
  query_embedding public.vector(1024),
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
set search_path = 'public'
as $$
  select
    id as email_id,
    (embedding <=> query_embedding) as distance
  from public.emails
  where
    workspace_id = p_workspace_id
    and id != p_exclude_email_id
    and embedding is not null
    and processing_state = 'processed'
  order by embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_emails_for_context from authenticated;
grant execute on function public.match_emails_for_context to service_role;

-- 3. rls_auto_enable: revoke public exposure
revoke execute on function public.rls_auto_enable() from anon, authenticated;
