---
name: "Supabase Services"
description: "Use when writing Supabase queries, database service code, or data access layers. Covers RLS, storage, and service abstraction."
applyTo: "**/*.service.ts"
---

# Supabase Service Conventions

- Never call Supabase directly from components — always use a service abstraction
- RLS is the security boundary — frontend is untrusted (Invariant I5)
- All TypeScript types come from Supabase-generated schema — no `any`
- Services use `providedIn: 'root'`

## Data Access

- Queries go through `SupabaseService` or domain-specific services
- All data is scoped by `org_id` — RLS enforces this server-side
- Handle errors explicitly: check `.error` on every Supabase response

## Storage

- Private `images/` bucket
- Paths are relative: `{org_id}/{user_id}/{uuid}.jpg`
- Use signed URLs at runtime — never store or serve absolute URLs
- `UploadService` handles file upload orchestration

## References

- Database schema: [docs/database-schema.md](../../docs/database-schema.md)
- Security boundaries: [docs/security-boundaries.md](../../docs/security-boundaries.md)
