-- Explicit role grants for all application tables.
-- Supabase does not automatically grant table-level privileges when migrations
-- are run via the SQL editor. These grants are required alongside RLS policies:
-- RLS controls row visibility, but the role still needs the basic privilege first.

-- authenticated: the role used by signed-in users via the anon key + JWT.
grant select, insert, update, delete on workspaces               to authenticated;
grant select, insert, update, delete on workspace_members        to authenticated;
grant select, insert, update         on emails                   to authenticated;
grant select                         on email_processing_log     to authenticated;
grant select, insert, update, delete on rooms                    to authenticated;
grant select, insert, update, delete on room_emails              to authenticated;
grant select, insert, update, delete on jobs                     to authenticated;
grant select                         on assets                   to authenticated;
grant select, insert, update, delete on contacts                 to authenticated;
grant select                         on email_accounts           to authenticated;
grant select, insert, update, delete on vip_senders              to authenticated;

-- service_role: used by server-side admin operations and Trigger.dev jobs.
-- Bypasses RLS but still requires table-level privileges.
grant all privileges on all tables in schema public    to service_role;
grant all privileges on all sequences in schema public to service_role;
