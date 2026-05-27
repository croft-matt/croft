-- Add extracted_text column to assets table.
-- Stores plain text extracted from PDF, DOCX, and other text-based attachments
-- so Tier 3 can read attachment content during classification.
-- Populated synchronously before Tier 3 runs (for new emails) and by the
-- fetch-attachments background job (for backfill / retry cases).

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS extracted_text text;
