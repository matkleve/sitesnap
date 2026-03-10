-- =============================================================================
-- Add structured address columns and user_name to cluster_images RPC
--
-- New columns on images: city, district, street, country
-- These are populated by reverse geocoding (or manual entry).
-- The cluster_images RPC is updated to return these plus user_name.
-- =============================================================================

-- 1. Add structured address columns
ALTER TABLE public.images
  ADD COLUMN IF NOT EXISTS city     text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS street   text,
  ADD COLUMN IF NOT EXISTS country  text;

-- 2. Index for grouping queries
CREATE INDEX IF NOT EXISTS idx_images_city    ON public.images (city)    WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_images_country ON public.images (country) WHERE country IS NOT NULL;

-- 3. Recreate cluster_images RPC with new columns + user_name
DROP FUNCTION IF EXISTS public.cluster_images(numeric, numeric, int);

CREATE OR REPLACE FUNCTION public.cluster_images(
  p_cluster_lat numeric,
  p_cluster_lng numeric,
  p_zoom        int
)
RETURNS TABLE (
  image_id       uuid,
  latitude       numeric,
  longitude      numeric,
  thumbnail_path text,
  storage_path   text,
  captured_at    timestamptz,
  created_at     timestamptz,
  project_id     uuid,
  project_name   text,
  direction      numeric,
  exif_latitude  numeric,
  exif_longitude numeric,
  address_label  text,
  city           text,
  district       text,
  street         text,
  country        text,
  user_name      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH grid AS (
    SELECT
      CASE
        WHEN p_zoom >= 19 THEN 0::numeric
        ELSE (80.0 * 360.0) / (256.0 * power(2, p_zoom))
      END AS cell_size
  ),
  snapped_input AS (
    SELECT
      CASE WHEN g.cell_size > 0
        THEN ROUND(p_cluster_lat / g.cell_size) * g.cell_size
        ELSE p_cluster_lat
      END AS snap_lat,
      CASE WHEN g.cell_size > 0
        THEN ROUND(p_cluster_lng / g.cell_size) * g.cell_size
        ELSE p_cluster_lng
      END AS snap_lng
    FROM grid g
  )
  SELECT
    i.id            AS image_id,
    i.latitude,
    i.longitude,
    i.thumbnail_path,
    i.storage_path,
    i.captured_at,
    i.created_at,
    i.project_id,
    p.name          AS project_name,
    i.direction,
    i.exif_latitude,
    i.exif_longitude,
    i.address_label,
    i.city,
    i.district,
    i.street,
    i.country,
    pr.full_name    AS user_name
  FROM public.images i
  CROSS JOIN grid g
  CROSS JOIN snapped_input si
  LEFT JOIN public.projects p ON p.id = i.project_id
  LEFT JOIN public.profiles pr ON pr.id = i.user_id
  WHERE i.organization_id = public.user_org_id()
    AND i.latitude  IS NOT NULL
    AND i.longitude IS NOT NULL
    AND (
      (g.cell_size > 0 AND
       ROUND(i.latitude  / g.cell_size) * g.cell_size = si.snap_lat AND
       ROUND(i.longitude / g.cell_size) * g.cell_size = si.snap_lng)
      OR
      (g.cell_size = 0 AND
       ROUND(i.latitude, 7) = p_cluster_lat AND
       ROUND(i.longitude, 7) = p_cluster_lng)
    )
  ORDER BY COALESCE(i.captured_at, i.created_at) DESC
  LIMIT 500;
$$;
