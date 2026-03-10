---
name: "Angular Components"
description: "Use when creating or editing Angular components or component TypeScript files. Covers standalone patterns, signals, naming, and structure."
applyTo: "**/*.component.ts"
---

# Angular Component Conventions

- All components must be **standalone** — no NgModules
- Use Angular signals for reactive state
- Services use `providedIn: 'root'`
- Never call Leaflet or Supabase APIs directly — use service abstractions (`MapAdapter`, `SupabaseService`)

## Naming

- File naming: `kebab-case.component.ts`, `.html`, `.scss`, `.spec.ts`
- Component class: `PascalCaseComponent`
- Use canonical names from `docs/glossary.md`

## Structure

- Feature components: `src/app/features/{feature}/`
- Core services: `src/app/core/`
- Each component gets its own directory

## Templates (applies to `.component.html`)

- Match the component hierarchy from the element spec exactly
- Implement ALL listed actions — do not skip any
- Use `@if`, `@for`, `@switch` control flow (not `*ngIf`, `*ngFor`)

- Always provide loading, error, and empty states
