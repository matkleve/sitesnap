-- Deduplication hash storage for resume-safe uploads.
-- See docs/element-specs/upload-manager.md §Deduplication.

-- ── Table ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dedup_hashes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  image_id     uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, content_hash)
);

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE dedup_hashes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hashes"
  ON dedup_hashes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Index for batch lookups ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dedup_hashes_user_hash
  ON dedup_hashes (user_id, content_hash);

-- ── Batch dedup check function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_dedup_hashes(hashes text[])
RETURNS TABLE(content_hash text, image_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT dh.content_hash, dh.image_id
  FROM dedup_hashes dh
  WHERE dh.user_id = auth.uid()
    AND dh.content_hash = ANY(hashes);
$$;
