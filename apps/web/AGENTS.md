# Angular Web App — Package Guidelines

## Tech Stack

Angular 21 (standalone, signals) · TypeScript strict · Tailwind + SCSS · Leaflet via `MapAdapter` · Supabase (Auth, Storage, PostGIS) · Nominatim via `GeocodingAdapter` · Vitest + jsdom

## Project Structure

```
src/app/
  core/           → singleton services (auth, upload, search, supabase)
  features/       → route-level feature components
    map/map-shell/  → main map page (primary screen)
    nav/            → sidebar navigation
    upload/         → upload panel
    auth/           → login, register, reset-password
    photos/         → photo gallery page
    groups/         → groups management page
    settings/       → settings page
    account/        → account management page
  environments/   → environment configs
```

## Key Rules

- Standalone components only — no NgModules
- Never call Leaflet or Supabase directly — use service abstractions
- All DB types from Supabase-generated types — no `any`
- Match the component hierarchy in the element spec exactly
- Use glossary names from `docs/glossary.md`
- Floating/overlay elements go in Map Zone, not outside Map Shell

## Build & Test

- `npm run build` — production build
- `npm run test` — Vitest test suite
- `npm run lint` — ESLint
