-- =============================================================================
-- RPC: resolve_image_location
--
-- Updates a single image with resolved address and/or GPS coordinates.
-- Used by the LocationResolverService for both directions:
--   - Reverse geocode: fills address fields from existing GPS
--   - Forward geocode: fills GPS from existing address
--
-- Guard: verifies the caller belongs to the same organization as the image.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_image_location(
  p_image_id      uuid,
  p_latitude      numeric   DEFAULT NULL,
  p_longitude     numeric   DEFAULT NULL,
  p_address_label text      DEFAULT NULL,
  p_city          text      DEFAULT NULL,
  p_district      text      DEFAULT NULL,
  p_street        text      DEFAULT NULL,
  p_country       text      DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  SELECT organization_id INTO _org_id
    FROM public.profiles
   WHERE id = auth.uid();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User profile or organization not found';
  END IF;

  UPDATE public.images
     SET latitude            = COALESCE(p_latitude, latitude),
         longitude           = COALESCE(p_longitude, longitude),
         address_label       = COALESCE(p_address_label, address_label),
         city                = COALESCE(p_city, city),
         district            = COALESCE(p_district, district),
         street              = COALESCE(p_street, street),
         country             = COALESCE(p_country, country),
         location_unresolved = false
   WHERE id = p_image_id
     AND organization_id = _org_id;

  RETURN FOUND;
END;
$$;
