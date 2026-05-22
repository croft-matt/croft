-- Allow asset rows to be inserted without a storage path.
-- Tier 3 extracts asset mentions before files are available.
-- storage_path is populated later when attachment bytes are fetched and uploaded.
alter table assets alter column storage_path drop not null;
