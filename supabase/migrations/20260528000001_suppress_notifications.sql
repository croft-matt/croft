-- Flag emails ingested during the initial Gmail history import so Tier 3
-- can write their notifications pre-read. Avoids flooding a new user's
-- activity feed with unread counts for mail that predates their signup.
alter table emails
  add column suppress_notifications boolean not null default false;
