-- Add alert_text to rooms for caching the overdue alert message.
-- Generated once per room per hour by the room synthesis job via a Haiku call.
-- Never regenerated on every page load.
alter table rooms add column alert_text text;
alter table rooms add column alert_text_updated_at timestamptz;
