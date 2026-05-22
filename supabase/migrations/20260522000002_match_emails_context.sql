-- Vector similarity search for reconciliation context.
-- Returns emails nearest to a query embedding within a workspace,
-- excluding the email being classified.
-- Used by getReconciliationContext to build the semantic candidate layer.

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
security definer
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

grant execute on function match_emails_for_context to authenticated, service_role;
