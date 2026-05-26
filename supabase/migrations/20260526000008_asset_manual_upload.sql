-- Make email_id nullable (uploads have no source email)
ALTER TABLE assets ALTER COLUMN email_id DROP NOT NULL;

-- Direct room link for uploaded files
ALTER TABLE assets ADD COLUMN room_id uuid REFERENCES rooms(id) ON DELETE CASCADE;

-- Track how the asset arrived
-- Values: 'email_attachment' | 'user_upload'
ALTER TABLE assets ADD COLUMN source text NOT NULL DEFAULT 'email_attachment';

-- Index for the new query path
CREATE INDEX idx_assets_room_id ON assets(room_id);
