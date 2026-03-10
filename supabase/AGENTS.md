# Supabase — Package Guidelines

## Database

- PostgreSQL with PostGIS extension for geospatial queries
- Row-Level Security (RLS) enforced on all tables — no exceptions
- All data access goes through `org_id` scoping; users only see their organization's data
- Supabase-generated TypeScript types are the single source of truth for the frontend

## Migrations

- Files in `migrations/` with timestamp-prefixed names: `YYYYMMDDHHMMSS_description.sql`
- Order matters: extensions → tables → indexes → functions/triggers → RLS → seed → storage
- Never drop columns in the same migration as code removal
- Always test rollback before merging

## Storage

- Private `images/` bucket
- Paths are relative: `{org_id}/{user_id}/{uuid}.jpg`
- Use signed URLs at runtime — never store or expose absolute URLs

## References

- Schema: `docs/database-schema.md`
- Security rules: `docs/security-boundaries.md`
- RLS policies: `migrations/20260303000005_rls.sql`
