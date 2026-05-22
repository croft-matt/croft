-- Ensure the assets storage bucket exists.
-- The bucket is private: files are served via signed URLs or the service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 52428800, null)
on conflict (id) do nothing;
