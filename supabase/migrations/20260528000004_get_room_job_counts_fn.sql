-- DB function for synthesiseRoom job counts.
--
-- Replaces the fetch-all-email-IDs-then-IN pattern in lib/rooms/synthesise.ts.
-- The old approach fetched every email_id for a room into application memory,
-- then passed that full array to three separate IN clause COUNT queries.
-- At a few hundred emails per room this hits PostgREST URL length limits and
-- degrades the query plan. This function keeps the join inside Postgres.
--
-- Called with the admin (service role) client, which bypasses RLS. The
-- room_id scoping is the authorisation boundary -- callers must verify room
-- access before invoking this function.
create or replace function get_room_job_counts(
  p_room_id uuid,
  p_connected_address text default null
)
returns table (total bigint, closed bigint, overdue bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint as total,
    count(*) filter (where j.status = 'closed')::bigint as closed,
    count(*) filter (
      where j.status = 'open'
        and j.due is not null
        and j.due < now()
        and (p_connected_address is null or lower(j.owner) = lower(p_connected_address))
    )::bigint as overdue
  from jobs j
  join room_emails re on re.email_id = j.email_id
  where re.room_id = p_room_id;
$$;

-- Only the service role calls this function (synthesiseRoom runs with admin client).
revoke execute on function get_room_job_counts(uuid, text) from public, authenticated;
grant execute on function get_room_job_counts(uuid, text) to service_role;
