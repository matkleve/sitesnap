-- =============================================================================
-- RPC: cluster_images
-- Returns all individual images that belong to a specific cluster grid cell.
-- Uses the same grid-snapping formula as viewport_markers so the results
-- match exactly what the map shows as a single cluster dot.
--
-- Respects RLS via public.user_org_id() — only returns the caller's org.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cluster_images(
  p_cluster_lat numeric,
  p_cluster_lng numeric,
  p_zoom        int
)
RETURNS TABLE (
  image_id             uuid,
  latitude             numeric,
  longitude            numeric,
  thumbnail_path       text,
  storage_path         text,
  captured_at          timestamptz,
  created_at           timestamptz,
  project_id           uuid,
  project_name         text,
  direction            numeric,
  exif_latitude        numeric,
  exif_longitude       numeric
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
  -- Re-snap the input coordinates back to the grid.
  -- viewport_markers returns AVG(lat/lng) for visual accuracy, but this RPC
  -- needs the grid-snapped value. ROUND(avg / cell_size) * cell_size recovers
  -- the correct cell because the average always falls within its source cell.
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
    i.id                  AS image_id,
    i.latitude,
    i.longitude,
    i.thumbnail_path,
    i.storage_path,
    i.captured_at,
    i.created_at,
    i.project_id,
    p.name                AS project_name,
    i.direction,
    i.exif_latitude,
    i.exif_longitude
  FROM public.images i
  CROSS JOIN grid g
  CROSS JOIN snapped_input si
  LEFT JOIN public.projects p ON p.id = i.project_id
  WHERE i.organization_id = public.user_org_id()
    AND i.latitude  IS NOT NULL
    AND i.longitude IS NOT NULL
    AND (
      -- Compare each image's snapped coords against the re-snapped input
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
