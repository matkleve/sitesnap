-- =============================================================================
-- RPC: get_unresolved_images
--
-- Returns images that need address or GPS resolution, scoped to the caller's
-- organization. Used by the background LocationResolverService to backfill
-- missing address/GPS data one image at a time.
--
-- An image is "unresolved" if:
--   1. It has GPS but is missing address fields (reverse geocode needed), OR
--   2. It has address fields but no GPS (forward geocode needed)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_unresolved_images(
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  image_id       uuid,
  latitude       numeric,
  longitude      numeric,
  address_label  text,
  city           text,
  district       text,
  street         text,
  country        text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id            AS image_id,
    i.latitude,
    i.longitude,
    i.address_label,
    i.city,
    i.district,
    i.street,
    i.country
  FROM public.images i
  WHERE i.organization_id = public.user_org_id()
    AND (
      -- Case 1: has GPS, missing any address field
      (
        i.latitude IS NOT NULL AND i.longitude IS NOT NULL
        AND (i.address_label IS NULL OR i.city IS NULL OR i.district IS NULL OR i.street IS NULL OR i.country IS NULL)
      )
      OR
      -- Case 2: has address, missing GPS
      (
        i.latitude IS NULL AND i.longitude IS NULL
        AND i.address_label IS NOT NULL
      )
    )
  ORDER BY i.created_at DESC
  LIMIT p_limit;
$$;
