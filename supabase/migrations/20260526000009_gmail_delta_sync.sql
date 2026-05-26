-- Gmail delta sync: store historyId for incremental sync.
alter table email_accounts
  add column last_history_id text;

-- Extend source check constraint to include sent items pulled via Gmail API.
-- Inline check constraints are auto-named by Postgres as {table}_{column}_check.
-- Verify the name first: select conname from pg_constraint where conrelid = 'emails'::regclass and contype = 'c';
alter table emails
  drop constraint if exists emails_source_check;

alter table emails
  add constraint emails_source_check
  check (source in ('inbound', 'user_cc', 'user_direct', 'user_sent'));
