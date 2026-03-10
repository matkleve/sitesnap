# SiteSnap — Agent Guidelines

Sitesnap is a geo-temporal image management system for construction companies.
Angular SPA + Leaflet map + Supabase (Auth, PostgreSQL + PostGIS, Storage).

## Project Structure

```
apps/web/             → Angular frontend application (Angular CLI 21.1.5)
apps/web/src/app/     → Components, services, routing
apps/web/src/         → index.html, main.ts, styles.scss
supabase/             → Database migrations, RLS policies, edge functions
docs/                 → Design docs, element specs, glossary (source of truth)
```

## Development

### Install dependencies
```bash
npm install
```

### Run the dev server
```bash
cd apps/web && ng serve
```

### Build
```bash
cd apps/web && ng build
```

### Run tests
```bash
cd apps/web && ng test
```

## Code Conventions

- Use Angular **standalone components** (no NgModules)
- Use Angular **signals** and new control flow syntax (`@if`, `@for`, `@switch`)
- Prefer **`inject()`** over constructor injection
- **SCSS** for component styling
- Commit messages follow **Conventional Commits** (`feat:`, `fix:`, `chore:`)
- Always run `ng build` to verify changes compile before submitting

## Universal Invariants

- **RLS is the security boundary** — frontend is untrusted; Row-Level Security enforces all data access
- **Adapter pattern** — never call Leaflet, Supabase, or Nominatim directly from components; use `MapAdapter`, `GeocodingAdapter`, `SupabaseService`
- **Element specs are contracts** — read `docs/element-specs/[element].md` before building any feature
- **Glossary is canonical** — use exact names from `docs/glossary.md`

## Before Implementing a Feature

1. Read the element spec: `docs/element-specs/[element].md`
2. Read the implementation blueprint if it exists: `docs/implementation-blueprints/[element].md`
3. Only read additional design docs (`docs/design/tokens.md`, `docs/design/layout.md`, etc.) if the spec doesn't answer your styling questions

## Design Principles (summary)

Field-first, map-primary, progressive disclosure, warmth, calm confidence.
Non-negotiable rules: `docs/design/constitution.md`
