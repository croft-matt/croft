alter table emails
  add column if not exists room_id uuid references rooms(id) on delete set null,
  add column if not exists attached_asset_ids uuid[] default array[]::uuid[];

create index if not exists emails_room_id_idx on emails(room_id);
create index if not exists emails_thread_id_idx on emails(thread_id);
