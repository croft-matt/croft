-- Add source column to emails to record how an email arrived.
--   inbound     : standard path, from a third party (existing default)
--   user_cc     : connected user sent an email and CC'd Croft's inbound address
--   user_direct : connected user sent an email directly TO Croft's inbound address
--
-- All existing rows get 'inbound' via the column default. No backfill needed.

alter table emails
  add column source text not null default 'inbound'
  check (source in ('inbound', 'user_cc', 'user_direct'));

create index on emails(workspace_id, source);
