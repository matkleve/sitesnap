-- =============================================================================
-- RPC: viewport_markers
-- Returns clustered or individual markers for the visible map viewport.
-- Grid cell size is computed from the marker's pixel footprint at the
-- current zoom level so clusters merge exactly when markers would overlap.
--
-- Formula: cell_size = (marker_px * 360) / (256 * 2^zoom)
-- marker_px = 80  (64 px icon width + 16 px breathing room)
--
-- This maps each zoom level to the geographic distance one marker covers
-- on screen, guaranteeing no visual overlap.
-- Respects RLS via public.user_org_id() — only returns the caller's org.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.viewport_markers(
  min_lat numeric,
  min_lng numeric,
  max_lat numeric,
  max_lng numeric,
  zoom     int
)
RETURNS TABLE (
  cluster_lat    numeric,
  cluster_lng    numeric,
  image_count    bigint,
  image_id       uuid,
  direction      numeric,
  storage_path   text,
  thumbnail_path text,
  exif_latitude  numeric,
  exif_longitude numeric,
  created_at     timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH grid AS (
    SELECT
      -- Pixel-aware grid: cell_size in degrees = marker_px * 360 / (256 * 2^zoom).
      -- marker_px = 80 (64 px icon width + 16 px gap).
      -- At zoom >= 19 show individual markers (cell_size = 0).
      CASE
        WHEN zoom >= 19 THEN 0::numeric
        ELSE (80.0 * 360.0) / (256.0 * power(2, zoom))
      END AS cell_size
  ),
  filtered AS (
    SELECT
      i.id,
      i.latitude,
      i.longitude,
      i.direction    AS dir,
      i.storage_path AS s_path,
      i.thumbnail_path AS t_path,
      i.exif_latitude  AS exif_lat,
      i.exif_longitude AS exif_lng,
      i.created_at     AS c_at,
      -- Snap coordinates to the grid. When cell_size = 0 use raw coords.
      CASE WHEN g.cell_size > 0
        THEN ROUND(i.latitude  / g.cell_size) * g.cell_size
        ELSE i.latitude
      END AS snap_lat,
      CASE WHEN g.cell_size > 0
        THEN ROUND(i.longitude / g.cell_size) * g.cell_size
        ELSE i.longitude
      END AS snap_lng
    FROM public.images i, grid g
    WHERE i.organization_id = public.user_org_id()
      AND i.latitude  IS NOT NULL
      AND i.longitude IS NOT NULL
      AND i.latitude  BETWEEN min_lat AND max_lat
      AND i.longitude BETWEEN min_lng AND max_lng
  ),
  clustered AS (
    SELECT
      snap_lat,
      snap_lng,
      COUNT(*)                           AS cnt,
      -- For single-image cells, surface the image details.
      -- Using MIN() on a single row is effectively a pass-through.
      CASE WHEN COUNT(*) = 1 THEN MIN(id::text)::uuid END AS single_id,
      CASE WHEN COUNT(*) = 1 THEN MIN(dir)       END AS single_dir,
      CASE WHEN COUNT(*) = 1 THEN MIN(s_path)    END AS single_s_path,
      CASE WHEN COUNT(*) = 1 THEN MIN(t_path)    END AS single_t_path,
      CASE WHEN COUNT(*) = 1 THEN MIN(exif_lat)  END AS single_exif_lat,
      CASE WHEN COUNT(*) = 1 THEN MIN(exif_lng)  END AS single_exif_lng,
      CASE WHEN COUNT(*) = 1 THEN MIN(c_at)      END AS single_c_at,
      -- For clusters: pick representative direction (mode is expensive, just use any)
      CASE WHEN COUNT(*) > 1 THEN MIN(dir)       END AS cluster_dir,
      -- Use avg position for the cluster center (more visually accurate than snap)
      AVG(latitude)  AS avg_lat,
      AVG(longitude) AS avg_lng
    FROM filtered
    GROUP BY snap_lat, snap_lng
  )
  SELECT
    ROUND(CASE WHEN cnt = 1 THEN avg_lat ELSE avg_lat END, 7)  AS cluster_lat,
    ROUND(CASE WHEN cnt = 1 THEN avg_lng ELSE avg_lng END, 7)  AS cluster_lng,
    cnt                                                          AS image_count,
    single_id                                                    AS image_id,
    COALESCE(single_dir, cluster_dir)                            AS direction,
    single_s_path                                                AS storage_path,
    single_t_path                                                AS thumbnail_path,
    single_exif_lat                                              AS exif_latitude,
    single_exif_lng                                              AS exif_longitude,
    single_c_at                                                  AS created_at
  FROM clustered
  ORDER BY cnt DESC, cluster_lat, cluster_lng
  LIMIT 2000;
$$;
