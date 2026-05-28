-- Performance index fixes from 2026-05-28 audit.
--
-- L2: Drop the standalone emails(thread_id) index added in 20260526000006_sendmail_reply_fields.sql.
-- All thread queries filter by workspace_id first, so the composite
-- emails(workspace_id, thread_id) index from 20260522000001 already covers them.
-- The standalone index adds write overhead on every insert with no query benefit.
drop index if exists emails_thread_id_idx;

-- L1a: Partial index for the requires_response filter used in getWaitingEmails
-- and getHomeCounts (lib/queries/home.ts). Both queries filter
-- workspace_id + requires_response = true + processing_state = 'processed'.
-- Covering received_at desc matches the ORDER BY in getWaitingEmails.
create index emails_requires_response_idx
  on emails(workspace_id, received_at desc)
  where requires_response = true;

-- L1b: Partial index for the owner filter used in getWaitingOnOthers and
-- getHomeCounts (lib/queries/home.ts). Covers the open-jobs-by-owner
-- pattern; partial on owner is not null avoids indexing unassigned jobs.
create index jobs_owner_idx
  on jobs(workspace_id, owner)
  where owner is not null;
