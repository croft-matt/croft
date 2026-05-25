alter table rooms
  add column room_summary text,
  add column room_summary_updated_at timestamptz;
