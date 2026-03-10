-- =============================================================================
-- Spatial index (PostGIS) — primary path for viewport + radius queries
-- =============================================================================
create index idx_images_geog
  on public.images using gist (geog);

-- =============================================================================
-- Images — common query columns
-- =============================================================================
create index idx_images_user_id
  on public.images (user_id);

create index idx_images_organization_id
  on public.images (organization_id);

create index idx_images_project_id
  on public.images (project_id);

create index idx_images_captured_at
  on public.images (captured_at desc nulls last);

create index idx_images_org_captured
  on public.images (organization_id, captured_at desc nulls last);

-- =============================================================================
-- Projects
-- =============================================================================
create index idx_projects_organization_id
  on public.projects (organization_id);

create index idx_projects_created_by
  on public.projects (created_by);

-- =============================================================================
-- Metadata keys — autocomplete queries scoped to org
-- =============================================================================
create index idx_metadata_keys_organization_id
  on public.metadata_keys (organization_id);

-- Image metadata — filter by key across images
create index idx_image_metadata_key_id
  on public.image_metadata (key_id);

-- =============================================================================
-- User roles — role lookups for RLS helper functions
-- =============================================================================
create index idx_user_roles_user_id
  on public.user_roles (user_id);

-- =============================================================================
-- Saved groups
-- =============================================================================
create index idx_saved_groups_user_id
  on public.saved_groups (user_id);

-- =============================================================================
-- Profiles — org membership lookup (used in user_org_id() helper)
-- =============================================================================
create index idx_profiles_organization_id
  on public.profiles (organization_id);
