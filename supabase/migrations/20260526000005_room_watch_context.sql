-- Add watch_context to rooms for proactive room seeding (Brief 38).
-- Nullable: rooms created from inbound email have no watch context.
-- Shape is defined by the application layer, not enforced here.

alter table rooms
  add column watch_context jsonb;

comment on column rooms.watch_context is
  'First-party watch signals seeded by the user. Contacts to listen for, keywords, and anticipated items.';
