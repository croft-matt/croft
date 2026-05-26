-- Add created_from_email_id to rooms for provenance tracking.
-- Records which email (if any) triggered the room's creation.
-- Nullable -- only set for rooms created by the CC seeding or proactive room flows.
-- Existing rooms are unaffected (column defaults to null).

alter table rooms
  add column created_from_email_id uuid references emails(id) on delete set null;
