-- Add has_time boolean to images table.
-- When false, captured_at stores a date-only value (time component is midnight placeholder).
-- When true, captured_at includes a meaningful time.
-- Default false for existing rows.

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS has_time boolean NOT NULL DEFAULT false;

-- Backfill: existing rows with a non-midnight captured_at likely have EXIF time data.
UPDATE images
SET has_time = true
WHERE captured_at IS NOT NULL
  AND (EXTRACT(HOUR FROM captured_at) != 0 OR EXTRACT(MINUTE FROM captured_at) != 0);

COMMENT ON COLUMN images.has_time IS 'Whether captured_at includes a meaningful time component. When false, only the date portion is significant.';
