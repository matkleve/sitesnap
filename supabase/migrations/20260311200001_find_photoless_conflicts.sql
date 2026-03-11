-- Find photoless image rows (storage_path IS NULL) near the upload's
-- GPS coordinates or matching address. Used by UploadManagerService
-- during the conflict_check pipeline phase.
--
-- Parameters:
--   p_org_id  — the user's organization ID
--   p_lat     — upload's latitude (may be null)
--   p_lng     — upload's longitude (may be null)
--   p_address — upload's title-derived address (may be null)
--
-- Returns at most 1 row: the closest GPS match or earliest address match.

CREATE OR REPLACE FUNCTION find_photoless_conflicts(
  p_org_id  uuid,
  p_lat     double precision DEFAULT NULL,
  p_lng     double precision DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS TABLE(
  id            uuid,
  address_label text,
  latitude      double precision,
  longitude     double precision,
  distance_m    double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    i.id,
    i.address_label,
    i.latitude,
    i.longitude,
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND i.geog IS NOT NULL
      THEN ST_Distance(i.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography)
      ELSE NULL
    END AS distance_m
  FROM images i
  WHERE i.organization_id = p_org_id
    AND i.storage_path IS NULL
    AND (
      -- GPS proximity match (50m radius)
      (p_lat IS NOT NULL AND p_lng IS NOT NULL AND
       ST_DWithin(i.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography, 50))
      OR
      -- Address label match (case-insensitive)
      (p_address IS NOT NULL AND LOWER(i.address_label) = LOWER(p_address))
    )
  ORDER BY
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND i.geog IS NOT NULL
      THEN ST_Distance(i.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography)
      ELSE 0
    END ASC,
    i.created_at ASC
  LIMIT 1;
$$;
