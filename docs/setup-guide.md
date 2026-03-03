# Setup Guide

**Who this is for:** engineers setting up GeoSite locally for development.  
**What you'll get:** a practical checklist to run the app with Supabase-backed services.

---

## 1. Prerequisites

- Node.js LTS (≥18)
- npm (≥9)
- Angular CLI (`npm install -g @angular/cli`)
- Supabase project (local via `supabase start` or hosted dashboard)
- Git

---

## 2. Repository Structure

The project is an npm monorepo:

```
sitesnap/
  package.json          ← root workspace
  apps/
    web/                ← Angular SPA (standalone components)
      angular.json
      package.json
      src/
  supabase/
    config.toml         ← local Supabase config
  docs/                 ← architecture and design docs
```

Install all dependencies from the **root**:

```bash
git clone <repo-url>
cd sitesnap
npm install
```

---

## 3. Environment Variables

Create `.env` (or your framework-specific env file) with:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose to browser bundles)

If geocoding is proxied through your backend, configure:

- `GEOCODING_PROVIDER`
- `GEOCODING_API_KEY` (if your provider requires one)

---

## 4. Database Setup

Apply schema, extensions, and RLS policies before starting the app. Run these in the Supabase SQL Editor (or via migration files).

### 4.1 Enable PostGIS

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
-- Verify:
SELECT PostGIS_Version();
```

This must run before creating any table that uses `geography` columns.

### 4.2 Create Core Tables

In order (respecting FK dependencies):

1. `organizations`
2. `profiles` (FK → organizations, auth.users)
3. `roles`
4. `user_roles` (FK → profiles, roles)
5. `projects` (FK → organizations, profiles)
6. `images` (FK → profiles, projects, organizations) — includes `geog geography(Point, 4326)` column + trigger
7. `metadata_keys` (FK → organizations, profiles)
8. `image_metadata` (FK → images, metadata_keys)
9. `saved_groups` (FK → profiles)
10. `saved_group_images` (FK → saved_groups, images)
11. `coordinate_corrections` (FK → images, profiles)

See `database-schema.md` for full DDL.

### 4.3 Create Registration Trigger

The trigger on `auth.users` must:

- Create a `profiles` row with `organization_id` set to the default org.
- Assign the `user` role in `user_roles`.

See `user-lifecycle.md` §1.

### 4.4 Enable RLS

```sql
-- Enable RLS on every table with user/org-scoped data:
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_group_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordinate_corrections ENABLE ROW LEVEL SECURITY;
```

Then apply policies from `security-boundaries.md` §3.

### 4.5 Seed Baseline Data

```sql
-- Roles
INSERT INTO roles (name) VALUES ('admin'), ('user'), ('viewer');

-- Default organization (required before any user can register)
INSERT INTO organizations (name) VALUES ('Default Organization');
```

### 4.6 Create Storage Bucket

In the Supabase dashboard (Storage → New Bucket):

- **Name:** `images`
- **Public:** No (private bucket)
- **File size limit:** 25 MB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`

Then apply storage policies from `security-boundaries.md` §4.

---

## 5. Run the App

From the repository root:

```bash
# Start the Angular dev server
npm run start
# or, from the web app directory:
cd apps/web
ng serve
```

Open `http://localhost:4200`.

For local Supabase (optional):

```bash
supabase start   # starts local Supabase stack (Postgres, Auth, Storage, etc.)
supabase status  # shows local URLs and keys
```

---

## 6. Verification Checklist

- [ ] `SELECT PostGIS_Version();` returns a version string.
- [ ] `organizations` table contains at least one row.
- [ ] Registration creates both `auth.users` and `profiles` (with `organization_id` set).
- [ ] New users get default role `user`.
- [ ] Upload stores files in `images/{org_id}/{user_id}/{uuid}.jpg`.
- [ ] Thumbnails are generated and stored at `.../{uuid}_thumb.jpg`.
- [ ] Image records persist EXIF and corrected coordinate fields separately.
- [ ] `images.geog` is auto-populated by the trigger from lat/lng.
- [ ] Map requests are viewport-limited (not full-dataset fetches).
- [ ] Non-admin users cannot see rows from other organizations.
- [ ] Viewer-role users cannot INSERT/UPDATE/DELETE images.
- [ ] Signed URLs work for image retrieval (no public bucket access).

---

## 7. Common Failure Points

| Symptom                             | Likely Cause                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| Supabase client fails to initialize | Missing `SUPABASE_URL` or `SUPABASE_ANON_KEY` in env.            |
| Queries return empty results        | RLS enabled but policies not created yet.                        |
| Uploads fail with 403               | Storage policy mismatch — check bucket name and path convention. |
| Registration fails                  | `organizations` table empty — seed a default org first.          |
| Spatial queries don't work          | PostGIS extension not enabled, or `geog` column/trigger missing. |
| Geocoding not working locally       | `GEOCODING_PROVIDER` / `GEOCODING_API_KEY` not set.              |
| CORS errors on Storage              | CORS config in Supabase dashboard missing `localhost:4200`.      |
