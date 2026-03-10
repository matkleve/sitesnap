-- =============================================================================
-- Helper: get current user's organization id
-- Used in RLS policies to avoid per-row joins
-- =============================================================================
create or replace function public.user_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- =============================================================================
-- Helper: check if current user is admin
-- =============================================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'admin'
  );
$$;

-- =============================================================================
-- Helper: check if current user is viewer (read-only role)
-- =============================================================================
create or replace function public.is_viewer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'viewer'
  );
$$;

-- =============================================================================
-- Trigger: keep images.geog in sync with latitude/longitude
-- =============================================================================
create or replace function public.sync_image_geog()
returns trigger
language plpgsql
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geog := extensions.st_point(new.longitude, new.latitude)::extensions.geography;
  else
    new.geog := null;
  end if;
  return new;
end;
$$;

create trigger trg_images_geog
  before insert or update of latitude, longitude
  on public.images
  for each row execute function public.sync_image_geog();

-- =============================================================================
-- Trigger: auto-update updated_at columns
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger trg_images_updated_at
  before update on public.images
  for each row execute function public.set_updated_at();

create trigger trg_saved_groups_updated_at
  before update on public.saved_groups
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Trigger: on new auth.users row — create profile + assign default role
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role_id uuid;
begin
  -- Pick the first (and during MVP, only) organization
  select id into v_org_id from public.organizations limit 1;

  -- Create profile
  insert into public.profiles (id, organization_id, full_name, avatar_url)
  values (
    new.id,
    v_org_id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Assign default 'user' role
  select id into v_role_id from public.roles where name = 'user';
  if v_role_id is not null then
    insert into public.user_roles (user_id, role_id) values (new.id, v_role_id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
