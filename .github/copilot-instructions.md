# Copilot Instructions for SiteSnap

## Project Overview

SiteSnap is a geo-temporal image management system for construction companies. It is an Angular 21 SPA with a Leaflet map and a Supabase backend (Auth, PostgreSQL + PostGIS, Storage).

## Tech Stack

- **Frontend**: Angular 21 (standalone components), TypeScript, SCSS
- **Map**: Leaflet (via `MapAdapter` abstraction)
- **Backend**: Supabase (PostgreSQL + PostGIS, Auth, Edge Functions)
- **Build**: Angular CLI (`ng serve`, `ng build`)
- **Tests**: Vitest (`ng test`)

## Coding Style

- Use Angular **standalone components** — no NgModules
- Use Angular **signals** and new control flow syntax (`@if`, `@for`, `@switch`)
- Prefer **`inject()`** over constructor injection
- **SCSS** for component-scoped styles (complex layouts, animations, pseudo-elements)
- **Tailwind CSS** for utility classes in templates
- Use CSS custom properties for design tokens — never hardcode colors or spacing values
- Use Supabase client from `@supabase/supabase-js` — always through service abstractions, never directly in components

## File Naming Conventions

- Components: `feature-name.component.ts`, `feature-name.component.html`, `feature-name.component.scss`
- Services: `feature-name.service.ts`
- Tests co-located with source: `feature-name.component.spec.ts`

## Project Structure

```
apps/web/src/app/   → Angular components, services, routing
supabase/           → Migrations, RLS policies, edge functions
docs/               → Element specs, design tokens, glossary
```
