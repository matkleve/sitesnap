-- =============================================================================
-- RPC: bulk_update_image_addresses
--
-- Allows any authenticated org member to populate address fields on images
-- in their organization. Uses SECURITY DEFINER to bypass the row-level
-- owner-or-admin UPDATE policy, since address resolution is automated and
-- the resolved data is non-sensitive (derived from GPS coordinates).
--
-- Guard: verifies the caller belongs to the same organization as the images.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_image_addresses(
  p_image_ids     uuid[],
  p_address_label text,
  p_city          text DEFAULT NULL,
  p_district      text DEFAULT NULL,
  p_street        text DEFAULT NULL,
  p_country       text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _updated int;
BEGIN
  -- Resolve the caller's organization.
  SELECT organization_id INTO _org_id
    FROM public.profiles
   WHERE id = auth.uid();

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'User profile or organization not found';
  END IF;

  -- Update only images that belong to the caller's organization.
  UPDATE public.images
     SET address_label      = p_address_label,
         city               = p_city,
         district           = p_district,
         street             = p_street,
         country            = p_country,
         location_unresolved = false
   WHERE id = ANY(p_image_ids)
     AND organization_id = _org_id;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$$;
