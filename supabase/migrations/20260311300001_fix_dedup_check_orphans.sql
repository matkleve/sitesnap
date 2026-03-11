-- Fix dedup check: skip orphaned hashes where the image row has no storage_path.
-- This prevents "already uploaded" false positives when a previous upload succeeded
-- in DB but appeared to fail (photo never displayed → user retries → blocked).

CREATE OR REPLACE FUNCTION check_dedup_hashes(hashes text[])
RETURNS TABLE(content_hash text, image_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT dh.content_hash, dh.image_id
  FROM dedup_hashes dh
  JOIN images i ON i.id = dh.image_id
  WHERE dh.user_id = auth.uid()
    AND dh.content_hash = ANY(hashes)
    AND i.storage_path IS NOT NULL;
$$;
