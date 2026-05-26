-- Add source column to jobs to distinguish extracted vs anticipated items.
--   extracted   : derived from an actual email in the thread (existing default)
--   anticipated : created from watch_context when a proactive room was set up (brief 38)
--
-- All existing rows get 'extracted' via the column default. No backfill needed.

alter table jobs
  add column source text not null default 'extracted'
  check (source in ('extracted', 'anticipated'));

create index on jobs(workspace_id, source);
