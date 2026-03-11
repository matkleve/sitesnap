-- Relax images UPDATE/DELETE policies:
-- Any non-viewer org member can update/delete images in their org.
-- user_id tracks who uploaded the image — it should not gate edits.

drop policy "images: owner or admin update" on public.images;
create policy "images: org update"
  on public.images for update
  using (
    organization_id = public.user_org_id()
    and not public.is_viewer()
  );

drop policy "images: owner or admin delete" on public.images;
create policy "images: org delete"
  on public.images for delete
  using (
    organization_id = public.user_org_id()
    and not public.is_viewer()
  );
