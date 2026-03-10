---
name: "Database Migrations"
description: "Use when writing database migrations, schema changes, RLS policies, or SQL functions."
applyTo: "supabase/migrations/**"
---

# Migration Conventions

- Timestamp-prefixed filenames: `YYYYMMDDHHMMSS_description.sql`
- Execution order: extensions → tables → indexes → functions/triggers → RLS → seed → storage
- PostGIS is available — use `geometry` and `geography` types for spatial data
- RLS must be enabled on every new table — no exceptions

## Safety

- Always create reversible migrations
- Never drop columns in the same migration as code removal
- Test rollback before merging
- Use `IF NOT EXISTS` / `IF EXISTS` guards where appropriate

## References

- Schema: [docs/database-schema.md](../../docs/database-schema.md)
- Security: [docs/security-boundaries.md](../../docs/security-boundaries.md)
- Existing RLS: [supabase/migrations/20260303000005_rls.sql](../../supabase/migrations/20260303000005_rls.sql)
