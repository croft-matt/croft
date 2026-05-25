-- Foreign key index coverage.
--
-- Postgres doesn't automatically index foreign key columns. Without them,
-- cascade operations and parent-row deletes require a full table scan on the
-- child side. The indexes below cover every unindexed FK flagged by the linter.
--
-- Nullable FK columns use a partial index (WHERE col IS NOT NULL) to avoid
-- indexing the no-reference rows and keep the index small.

-- contact_identities: workspace_id and primary_contact_id
create index on contact_identities(workspace_id);
create index on contact_identities(primary_contact_id)
  where primary_contact_id is not null;

-- contact_merge_candidates: both contact FK columns.
-- The existing unique index on (workspace_id, contact_id_low, contact_id_high)
-- has workspace_id as the leading column so it doesn't cover plain FK lookups.
create index on contact_merge_candidates(contact_id_low);
create index on contact_merge_candidates(contact_id_high);

-- contacts: identity_id.
-- The existing (workspace_id, identity_id) index has workspace_id leading
-- so a plain identity_id FK lookup won't use it.
create index on contacts(identity_id)
  where identity_id is not null;

-- email_accounts: user_id
create index on email_accounts(user_id);

-- jobs: closed_by_email_id (nullable — only set when a job is auto-closed)
create index on jobs(closed_by_email_id)
  where closed_by_email_id is not null;

-- room_blocks: workspace_id.
-- The existing (room_id, status) index doesn't cover workspace_id.
create index on room_blocks(workspace_id);

-- rooms: created_by and parent_room_id (both nullable).
-- The existing (workspace_id, parent_room_id) index has workspace_id leading
-- so a cascade delete walking parent_room_id won't use it.
create index on rooms(created_by)
  where created_by is not null;
create index on rooms(parent_room_id)
  where parent_room_id is not null;
