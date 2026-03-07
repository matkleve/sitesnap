# GeoSite — Project Guidelines

GeoSite is a geo-temporal image management system for construction companies.
Angular SPA + Leaflet map + Supabase (Auth, PostgreSQL + PostGIS, Storage).

## Monorepo Structure

```
apps/web/     → Angular SPA (primary UI, Leaflet map, Tailwind + SCSS)
supabase/     → Database migrations, RLS policies, storage config
docs/         → Design docs, element specs, glossary (source of truth)
```

Each package has its own `AGENTS.md` with package-specific conventions.

## Universal Invariants

- **RLS is the security boundary** — frontend is untrusted; Row-Level Security enforces all data access
- **Adapter pattern for external APIs** — never call Leaflet, Supabase, or Nominatim directly from components; use service abstractions (`MapAdapter`, `GeocodingAdapter`, `SupabaseService`)
- **Element specs are implementation contracts** — read `docs/element-specs/[element].md` before building any feature
- **Glossary is canonical** — use exact UI element names from `docs/glossary.md`

## Before Implementing Any Feature

1. Read the element spec: `docs/element-specs/[element].md`
2. Check the glossary: `docs/glossary.md`
3. Check architecture constraints: `docs/architecture.md`
4. Load the always-load design files: `docs/design/constitution.md` and `docs/design.md`
5. Load the task-specific design files from the table below
6. Consult Context7 MCP for external library APIs (Angular, Leaflet, Supabase, Tailwind); if Context7 conflicts with project docs, prefer project docs

## Design File Loading

### Always load

- `docs/design/constitution.md` — non-negotiable design rules
- `docs/design.md` — principles, dark mode, accessibility, responsive summary, design debt

### Load by task

| Task                                            | Files to load                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Any visual or styling work                      | `docs/design/tokens.md`                                                    |
| Layout or breakpoints                           | `docs/design/layout.md`                                                    |
| Animation or transitions                        | `docs/design/motion.md`                                                    |
| Map hierarchy, clustering, or marker prominence | `docs/design/map-system.md`                                                |
| Map marker work                                 | `docs/design/components/marker.md` + `docs/design/map-system.md`           |
| Filter panel work                               | `docs/design/components/filter-panel.md`                                   |
| Workspace pane or gallery work                  | `docs/design/components/workspace-pane.md`                                 |
| Image detail view work                          | `docs/design/components/image-detail.md`                                   |
| Upload flow work                                | `docs/design/components/upload-flow.md`                                    |
| Radius selection work                           | `docs/design/components/radius-selection.md` + `docs/design/map-system.md` |
| Empty state work                                | `docs/design/components/empty-states.md`                                   |

### Never load in agentic coding sessions

- `docs/design/reference-products.md` — human reading only

## Design Principles (summary)

Field-first, map-primary, progressive disclosure, warmth, calm confidence.
See `docs/design.md` and `docs/design/constitution.md` for the always-load reference.
