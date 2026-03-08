# Angular Web App — Package Guidelines

## Tech Stack

- **Framework**: Angular 21 (standalone components, signals where applicable)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + SCSS for component-scoped styles
- **Map**: Leaflet via `MapAdapter` — never call Leaflet directly
- **Auth**: Supabase Auth (email/password, JWT)
- **Storage**: Supabase Storage (private `images/` bucket, signed URLs)
- **Geocoding**: Nominatim via `GeocodingAdapter`
- **Testing**: Vitest + jsdom

## Project Structure

```
src/app/
  core/           → singleton services (auth, upload, search, supabase)
  features/       → route-level feature components
    map/map-shell/  → main map page (the primary screen)
    nav/            → sidebar navigation
    upload/         → upload panel
    auth/           → login, register, reset-password
    photos/         → photo gallery page
    groups/         → groups management page
    settings/       → settings page
    account/        → account management page
  environments/   → environment configs
```

## Code Conventions

- Standalone components only — no NgModules
- Services use `providedIn: 'root'`
- All DB types from Supabase-generated types — no `any`
- File naming: `kebab-case.component.ts`, `kebab-case.service.ts`
- Component naming: `PascalCaseComponent` (e.g., `MapShellComponent`)
- Never call Leaflet or Supabase APIs directly from components — use service abstractions

## Commenting Guidance

- Add short explanatory comments when the reader would otherwise need to infer intent from implementation details
- Prefer comments for complex function purpose, non-obvious control flow, architectural constraints, data normalization, and side effects
- Use brief docblocks for orchestration-heavy methods when inputs, outputs, or failure modes are not obvious from the signature
- Avoid comments that only restate the code immediately below them
- Keep comments local and specific, for example stale-state guards, normalization decisions, or why a service boundary exists

## Design Tokens

- Background: `--color-bg-base` (#F9F7F4 light / #0F0E0C dark)
- Surface: `--color-bg-surface`
- Primary accent: `--color-clay` (warm terracotta)
- Tap targets: ≥48px mobile, ≥44px desktop
- Body text min: 14px / 0.875rem
- Transitions: 120–250ms
- Debounce: 300ms default

## UI Code Rules

- Match the component hierarchy in the element spec exactly
- Implement ALL listed actions — agents skip unlisted behaviors
- Use glossary names from `docs/glossary.md` for components
- Floating/overlay elements go in Map Zone, not outside Map Shell
- Ghost buttons for secondary actions, filled buttons for primary CTA only
- Hover-to-reveal for thumbnail card actions (Quiet Actions principle)
- Always provide empty states, loading states, and error states

## References

- Always-load design context: `docs/design/constitution.md`, `docs/design.md`
- Task-specific design files: `docs/design/tokens.md`, `docs/design/layout.md`, `docs/design/motion.md`, `docs/design/map-system.md`, `docs/design/components/`
- Glossary: `docs/glossary.md`
- Architecture: `docs/architecture.md`
- Element specs: `docs/element-specs/`
- Implementation blueprints: `docs/implementation-blueprints/` — companion docs with exact service signatures, Mermaid data flows, DB queries, and type definitions
