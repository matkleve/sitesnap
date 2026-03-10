-- =============================================================================
-- Organizations
-- =============================================================================
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- Profiles (1:1 with auth.users)
-- =============================================================================
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  full_name        text,
  avatar_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- Roles
-- =============================================================================
create table public.roles (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique  -- 'admin', 'user', 'viewer'
);

create table public.user_roles (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles (id) on delete cascade,
  role_id  uuid not null references public.roles (id) on delete restrict,
  unique (user_id, role_id)
);

-- =============================================================================
-- Projects
-- =============================================================================
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  created_by       uuid references public.profiles (id) on delete set null,
  name             text not null,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- Images
-- =============================================================================
create table public.images (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  project_id       uuid references public.projects (id) on delete set null,

  -- Storage
  storage_path     text not null,              -- relative path: {org_id}/{user_id}/{uuid}.jpg
  thumbnail_path   text,                       -- {org_id}/{user_id}/{uuid}_thumb.jpg

  -- Coordinates (EXIF — immutable after insert)
  exif_latitude    numeric(10, 7),
  exif_longitude   numeric(11, 7),

  -- Coordinates (user-corrected — mutable)
  latitude         numeric(10, 7),
  longitude        numeric(11, 7),

  -- PostGIS column (maintained by trigger from latitude/longitude)
  geog             extensions.geography(Point, 4326),

  -- Camera direction (degrees, 0–360)
  direction        numeric(5, 2),

  -- Timestamps
  captured_at      timestamptz,               -- from EXIF if available
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Constraints
  constraint chk_latitude  check (latitude  between -90  and 90),
  constraint chk_longitude check (longitude between -180 and 180),
  constraint chk_direction check (direction between 0    and 360)
);

-- =============================================================================
-- Metadata
-- =============================================================================
create table public.metadata_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  created_by       uuid references public.profiles (id) on delete set null,
  name             text not null,
  created_at       timestamptz not null default now()
);

create table public.image_metadata (
  id          uuid primary key default gen_random_uuid(),
  image_id    uuid not null references public.images (id) on delete cascade,
  key_id      uuid not null references public.metadata_keys (id) on delete restrict,
  value       text not null,
  created_at  timestamptz not null default now(),
  unique (image_id, key_id)
);

-- =============================================================================
-- Saved Groups (named tab collections)
-- =============================================================================
create table public.saved_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.saved_group_images (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.saved_groups (id) on delete cascade,
  image_id  uuid not null references public.images (id) on delete cascade,
  added_at  timestamptz not null default now(),
  unique (group_id, image_id)
);

-- =============================================================================
-- Coordinate Corrections (append-only audit log)
-- =============================================================================
create table public.coordinate_corrections (
  id            uuid primary key default gen_random_uuid(),
  image_id      uuid not null references public.images (id) on delete cascade,
  corrected_by  uuid references public.profiles (id) on delete set null,
  old_latitude  numeric(10, 7),
  old_longitude numeric(11, 7),
  new_latitude  numeric(10, 7) not null,
  new_longitude numeric(11, 7) not null,
  corrected_at  timestamptz not null default now()
);
