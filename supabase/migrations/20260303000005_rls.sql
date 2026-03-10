-- =============================================================================
-- Enable RLS on all user/org-scoped tables
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.roles                enable row level security;
alter table public.user_roles           enable row level security;
alter table public.projects             enable row level security;
alter table public.images               enable row level security;
alter table public.metadata_keys        enable row level security;
alter table public.image_metadata       enable row level security;
alter table public.saved_groups         enable row level security;
alter table public.saved_group_images   enable row level security;
alter table public.coordinate_corrections enable row level security;

-- =============================================================================
-- Profiles
-- =============================================================================
create policy "profiles: own read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid());

-- =============================================================================
-- Organizations
-- =============================================================================
create policy "organizations: own org read"
  on public.organizations for select
  using (id = public.user_org_id());

-- =============================================================================
-- Roles (readable by all authenticated users)
-- =============================================================================
create policy "roles: all authenticated read"
  on public.roles for select
  using (auth.uid() is not null);

-- =============================================================================
-- User roles
-- =============================================================================
create policy "user_roles: self read"
  on public.user_roles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "user_roles: admin write"
  on public.user_roles for insert
  with check (public.is_admin());

create policy "user_roles: admin delete"
  on public.user_roles for delete
  using (public.is_admin());

-- =============================================================================
-- Projects
-- =============================================================================
create policy "projects: org read"
  on public.projects for select
  using (organization_id = public.user_org_id());

create policy "projects: org insert"
  on public.projects for insert
  with check (
    organization_id = public.user_org_id()
    and not public.is_viewer()
  );

create policy "projects: owner or admin update"
  on public.projects for update
  using (
    (created_by = auth.uid() or public.is_admin())
    and organization_id = public.user_org_id()
  );

create policy "projects: owner or admin delete"
  on public.projects for delete
  using (
    (created_by = auth.uid() or public.is_admin())
    and organization_id = public.user_org_id()
  );

-- =============================================================================
-- Images
-- =============================================================================
create policy "images: org read"
  on public.images for select
  using (organization_id = public.user_org_id());

create policy "images: own insert"
  on public.images for insert
  with check (
    user_id = auth.uid()
    and organization_id = public.user_org_id()
    and not public.is_viewer()
  );

create policy "images: owner or admin update"
  on public.images for update
  using (
    (user_id = auth.uid() or public.is_admin())
    and organization_id = public.user_org_id()
    and not public.is_viewer()
  );

create policy "images: owner or admin delete"
  on public.images for delete
  using (
    (user_id = auth.uid() or public.is_admin())
    and organization_id = public.user_org_id()
    and not public.is_viewer()
  );

-- =============================================================================
-- Metadata keys
-- =============================================================================
create policy "metadata_keys: org read"
  on public.metadata_keys for select
  using (organization_id = public.user_org_id());

create policy "metadata_keys: org insert"
  on public.metadata_keys for insert
  with check (
    organization_id = public.user_org_id()
    and not public.is_viewer()
  );

create policy "metadata_keys: creator or admin delete"
  on public.metadata_keys for delete
  using (
    (created_by = auth.uid() or public.is_admin())
    and organization_id = public.user_org_id()
  );

-- =============================================================================
-- Image metadata (inherits from parent image)
-- =============================================================================
create policy "image_metadata: org read"
  on public.image_metadata for select
  using (
    exists (
      select 1 from public.images i
      where i.id = image_id
        and i.organization_id = public.user_org_id()
    )
  );

create policy "image_metadata: org insert"
  on public.image_metadata for insert
  with check (
    not public.is_viewer()
    and exists (
      select 1 from public.images i
      where i.id = image_id
        and i.organization_id = public.user_org_id()
    )
  );

create policy "image_metadata: org delete"
  on public.image_metadata for delete
  using (
    not public.is_viewer()
    and exists (
      select 1 from public.images i
      where i.id = image_id
        and i.organization_id = public.user_org_id()
    )
  );

-- =============================================================================
-- Saved groups (personal to creator)
-- =============================================================================
create policy "saved_groups: own read"
  on public.saved_groups for select
  using (user_id = auth.uid());

create policy "saved_groups: own insert"
  on public.saved_groups for insert
  with check (user_id = auth.uid());

create policy "saved_groups: own update"
  on public.saved_groups for update
  using (user_id = auth.uid());

create policy "saved_groups: own delete"
  on public.saved_groups for delete
  using (user_id = auth.uid());

-- =============================================================================
-- Saved group images
-- =============================================================================
create policy "saved_group_images: own read"
  on public.saved_group_images for select
  using (
    exists (
      select 1 from public.saved_groups g
      where g.id = group_id and g.user_id = auth.uid()
    )
  );

create policy "saved_group_images: own insert"
  on public.saved_group_images for insert
  with check (
    exists (
      select 1 from public.saved_groups g
      where g.id = group_id and g.user_id = auth.uid()
    )
  );

create policy "saved_group_images: own delete"
  on public.saved_group_images for delete
  using (
    exists (
      select 1 from public.saved_groups g
      where g.id = group_id and g.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Coordinate corrections (append-only audit log)
-- =============================================================================
create policy "coordinate_corrections: org read"
  on public.coordinate_corrections for select
  using (
    exists (
      select 1 from public.images i
      where i.id = image_id
        and i.organization_id = public.user_org_id()
    )
  );

create policy "coordinate_corrections: org insert"
  on public.coordinate_corrections for insert
  with check (
    not public.is_viewer()
    and exists (
      select 1 from public.images i
      where i.id = image_id
        and i.organization_id = public.user_org_id()
    )
  );

-- No UPDATE or DELETE — append-only
