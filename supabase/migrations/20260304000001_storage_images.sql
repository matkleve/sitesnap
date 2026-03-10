-- =============================================================================
-- Storage: images bucket + RLS policies
-- =============================================================================
-- Creates the private `images` bucket and the three storage object policies that
-- implement §4.2 of docs/security-boundaries.md.
--
-- Bucket layout: images/{org_id}/{user_id}/{uuid}.{ext}
--
-- Policies:
--   1. Authenticated org members (non-viewers) may INSERT objects whose path
--      prefix matches their own org + user IDs.
--   2. Authenticated org members may SELECT objects within their org prefix.
--   3. Object owners or org admins may DELETE objects within their org prefix.
--
-- Signed URLs are enforced at the application layer (TTL = 3600 s).
-- The bucket is NOT public — direct URL access is denied without a valid signature.
-- =============================================================================

-- ── Bucket ────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  false,                                         -- not public; signed URLs only
  26214400,                                      -- 25 MiB hard limit (matches architecture.md §5)
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do nothing;                     -- idempotent: safe to re-run

-- ── Storage RLS policies ──────────────────────────────────────────────────────
-- storage.objects RLS is enabled by default in Supabase.
-- All policies are scoped to the `images` bucket.

-- 1. Upload: org member (non-viewer) may upload to their own org/user prefix.
create policy "images: org members can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'images'
  -- first path segment must be the caller's org ID
  and (storage.foldername(name))[1] = public.user_org_id()::text
  -- second path segment must be the caller's user ID
  and (storage.foldername(name))[2] = auth.uid()::text
  -- viewers are blocked from uploads (see security-boundaries.md §2.2)
  and not public.is_viewer()
);

-- 2. Read: all org members can read objects within their org prefix.
create policy "images: org members can read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = public.user_org_id()::text
);

-- 3. Delete: object owner OR org admin may delete within the org prefix.
create policy "images: owner or admin can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = public.user_org_id()::text
  and (
    (storage.foldername(name))[2] = auth.uid()::text   -- owner
    or public.is_admin()                                -- or org admin
  )
);
