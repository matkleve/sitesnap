# GeoSite Project Milestones

Purpose: project milestone plan for GeoSite that is human-friendly and AI-readable.

---

## Ground Rules

Invariants that every implementation session must uphold.

### Architecture

- **AuthService owns all session state.** No component or guard reads `supabase.client.auth` directly.
- **All Supabase auth calls go through `AuthService`.** Components only call service methods.
- **Session signal is loaded before first route renders.** `APP_INITIALIZER` calls `AuthService.initialize()`; guards wait for `loading()` to be false via `waitForAuth()`.
- **All feature routes are lazy-loaded.** No eager imports of page components in `app.routes.ts`.
- **Errors are returned as `{ error }` objects; services never throw.** Components read `.error` and display where appropriate.

### Angular conventions

- **Standalone components everywhere.** No NgModules introduced.
- **`FormBuilder.nonNullable.group()`** for all reactive forms — avoids nullable value types.
- **Signals for local UI state** (`signal<boolean>`, `signal<string | null>`, etc.) — no BehaviorSubject in components.
- **Imports array is explicit in every standalone component.** Only what the template uses.

### Testing

- **Zero `fakeAsync` / `tick`.** Project uses the zoneless `@angular/build:unit-test` runner (Vitest). Use `async/await` + `fixture.whenStable()` or `vi.waitFor()`.
- **No real HTTP / Supabase calls in unit tests.** `SupabaseService` is replaced with a fake in every spec.
- **Router is mocked in components that have no `RouterLink`.** `{ provide: Router, useValue: { navigate: vi.fn() } }` avoids NG04002 from dangling navigations.
- **One `describe` per class/function; one `it` per behavior.** Follow Arrange–Act–Assert.

### Database

- **Every new table ships with RLS before use.** See `docs/security-boundaries.md §6`.
- **EXIF coordinates are immutable.** Corrections go into `coordinate_corrections`.
- **Migrations are sequential and numbered.** Never edit a pushed migration; add a new one.

---

## Planning Model

This plan intentionally uses two resolution layers.

- Phase A (`M1`-`M7`) is deterministic: concrete, testable, implementation-blocking.
- Phase B (`M8`-`M10`) is directional: outcome-oriented, adaptive, and less over-specified.

This keeps the core rigid where correctness matters and flexible where discovery is expected.

## Usage Instructions

- Execute milestones in order unless a milestone explicitly allows parallelization.
- Every completed TODO should include owner initials and date.
- If a change impacts invariants, schema shape, or dependencies, update `docs/decisions.md`.
- Keep terminology aligned with `docs/glossary.md`.

## Global Constraints

- Authorization is enforced by PostgreSQL RLS with organization-scoped visibility, never by frontend checks alone.
- EXIF coordinates are immutable; corrected coordinates are additive (see `coordinate_corrections` table).
- Map retrieval remains viewport-bounded, PostGIS-filtered, and cursor-paginated.
- MVP scope remains narrow until explicit expansion.
- Every new table must ship with RLS policies before use (see security-boundaries.md §6).

## Milestone Index

| ID  | Name                                               | Type          | Depends On |
| --- | -------------------------------------------------- | ------------- | ---------- |
| M1  | Product Baseline and Scope Lock                    | Deterministic | None       |
| M2  | Identity, Lifecycle, and Role Integrity            | Deterministic | M1         |
| M3  | Schema Finalization for MVP                        | Deterministic | M2         |
| M4  | Security Boundaries and RLS Policy Spec            | Deterministic | M3         |
| M5  | Map and Geocoding Behavior Contract                | Deterministic | M1, M3     |
| M6  | Ingestion and Marker Correction Pipeline           | Deterministic | M3, M4     |
| M7  | Filter and Retrieval Semantics                     | Deterministic | M5, M6     |
| M7a | Spatial Selection and Group Workspace              | Deterministic | M5, M6     |
| M8  | Performance Validation and Load Characterization   | Directional   | M7, M7a    |
| M9  | Evolution Readiness and Scope Expansion Guardrails | Directional   | M1-M8      |
| M10 | Release Readiness and Ongoing Governance           | Directional   | M4, M8, M9 |

---

## M1: Product Baseline and Scope Lock

Goal

- Freeze MVP contract so product and engineering decisions remain consistent.

Files

- `docs/project-description.md`
- `docs/features.md`
- `docs/use-cases/README.md`

TODOs

- [x] Add feature-to-use-case mapping table in `docs/features.md`. (AI, 2026-02-24)
- [x] Add "MVP Contract" section in `docs/project-description.md`. (AI, 2026-02-24)
- [x] Normalize non-goals wording across product docs. (AI, 2026-02-24)

Acceptance criteria

- No contradictions between MVP features and use-case coverage.
- Every MVP feature group maps to at least one use case.

## M2: Identity, Lifecycle, and Role Integrity

Goal

- Make user creation, role assignment, and deletion behavior unambiguous and safe.

Files

- `docs/user-lifecycle.md`
- `docs/database-schema.md`
- `docs/security-boundaries.md`
- `docs/setup-guide.md`

TODOs

- [x] Document registration trigger behavior for profile + default role. (AI, audit)
- [x] Document prevention of zero-role users. (AI, audit)
- [x] Document prevention of removing the last admin. (AI, audit)
- [x] Add lifecycle verification checklist to setup guide. (AI, audit)
- [x] Document organization assignment during registration. (AI, audit)
- [ ] Add password-reset E2E test expectations.

Acceptance criteria

- Lifecycle invariants are explicit and testable.
- Edge cases (zero-role user, last admin) are covered end-to-end.
- Every new user has a profile with a valid `organization_id`.

## M3: Schema Finalization for MVP

Goal

- Finalize schema contract so MVP implementation is unblockable.

Files

- `docs/database-schema.md`

TODOs

- [x] Confirm all MVP tables and critical relations are listed. (AI, audit)
- [x] Document nullability and FK delete behavior for key columns. (AI, audit — see cascade summary §12)
- [x] Document coordinate precedence (`corrected` then `EXIF`). (AI, audit)
- [x] Add recommended guardrails/check constraints. (AI, audit — CHECK on lat/lng/direction)
- [x] Add PostGIS geography column and GiST index. (AI, audit — D11)
- [x] Add `organizations` table and org-scoped FKs. (AI, audit — D12)
- [x] Add `saved_groups` / `saved_group_images` tables. (AI, audit — D14)
- [x] Add `coordinate_corrections` audit table. (AI, audit)

Acceptance criteria

- No unresolved schema ambiguity for MVP features.
- Core invariants I1-I5 are representable in schema constraints.
- PostGIS spatial queries work against `geog` column with GiST index.

## M4: Security Boundaries and RLS Policy Spec

Goal

- Provide complete authorization contract before implementation.

Files

- `docs/security-boundaries.md`
- `docs/setup-guide.md`

TODOs

- [x] Add explicit policy intent for `projects`, `metadata_keys`, `image_metadata`. (AI, audit)
- [ ] Add deny-case examples for unauthorized access.
- [x] Add storage access policy guidance (signed URL default, bucket structure). (AI, audit)
- [ ] Add step-by-step RLS verification workflow.
- [x] Add org-scoped RLS policies and `user_org_id()` helper. (AI, audit — D12)
- [x] Define `viewer` role permissions. (AI, audit)
- [x] Add CORS configuration guidance. (AI, audit)
- [x] Add RLS policies for `saved_groups` and `coordinate_corrections`. (AI, audit)

Acceptance criteria

- Every user/project-scoped table has policy guidance.
- Deny behavior is documented, not only allow behavior.
- Viewer role is explicitly blocked from write operations.

## M5: Map and Geocoding Behavior Contract

Goal

- Define deterministic map and geocoding behavior for consistent UX and testing.

Files

- `docs/architecture.md`
- `docs/decisions.md`
- `docs/use-cases/README.md`

TODOs

- [x] Add geocoding behavior matrix (exact, closest, no match). (AI, audit)
- [x] Add mandatory fallback notice requirement. (AI, audit)
- [x] Add ordering contract (distance asc, timestamp desc). (AI, audit)
- [x] Add UI state contract for loading/error/empty results. (AI, audit — architecture.md §13)
- [x] Add viewport query lifecycle with debounce and abort. (AI, audit — architecture.md §8)

Acceptance criteria

- Geocoding behavior is deterministic for all primary states.
- Ordering and fallback behavior are testable and non-silent.
- Viewport query lifecycle is fully specified.

## M6: Ingestion and Marker Correction Pipeline

Goal

- Define robust upload flow from file selection through spatial persistence.

Files

- `docs/features.md`
- `docs/use-cases/README.md`
- `docs/database-schema.md`

TODOs

- [x] Add end-to-end sequence: upload -> EXIF parse -> storage -> image row save. (AI, audit)
- [x] Add missing-EXIF fallback path (manual marker placement). (AI, audit)
- [x] Add marker correction persistence contract (`coordinate_corrections`). (AI, audit)
- [x] Add user-visible error and retry expectations. (AI, audit — architecture.md §13)
- [x] Add upload validation rules (25 MB, MIME types, HEIC conversion). (AI, audit — architecture.md §5)
- [x] Add upload concurrency contract (max 3 parallel). (AI, audit)

Acceptance criteria

- Success and failure branches are both documented.
- EXIF immutability and corrected-coordinate semantics are consistent across docs.
- Upload validation and error handling are fully specified.

## M7: Filter and Retrieval Semantics

Goal

- Lock filter and retrieval behavior for time/project/metadata/distance.

Files

- `docs/features.md`
- `docs/use-cases/README.md`
- `docs/database-schema.md`

TODOs

- [x] Define canonical filter-combination rules (AND/OR semantics). (AI, audit — features.md §1.8)
- [x] Define pagination defaults and maximum limits (cursor-based, 50/page). (AI, audit — architecture.md §8)
- [x] Define distance reference point and edge-case behavior. (AI, audit)
- [x] Add index coverage notes for dominant query paths. (AI, audit — database-schema.md §9)

Acceptance criteria

- Filter semantics are implementation-ready and unambiguous.
- Query behavior aligns with index strategy and pagination guardrails.

---

## M7a: Spatial Selection and Group Workspace

Goal

- Define and document the radius-selection interaction and group-based tabbed workspace.

Files

- `docs/architecture.md` (§11, §12)
- `docs/features.md` (§1.5, §1.7)
- `docs/decisions.md` (D13, D14)
- `docs/database-schema.md` (§10)
- `docs/use-cases/README.md` (UC1, UC2)

TODOs

- [x] Define right-click + drag radius selection interaction (desktop + mobile). (AI, audit — D13)
- [x] Define group workspace architecture (Active Selection + named groups). (AI, audit — D14)
- [x] Add `saved_groups` and `saved_group_images` schema. (AI, audit)
- [x] Add RLS policies for groups. (AI, audit)
- [x] Add radius selection to UC1 and UC2 alternative flows. (AI, audit)
- [ ] Define keyboard shortcuts for selection (S key, Ctrl+click, Escape).
- [ ] Define group sharing model (future: org-visible groups).

Acceptance criteria

- Radius selection is fully specified for desktop and mobile.
- Group workspace behavior (create, rename, delete, persist) is unambiguous.
- Active Selection ↔ Named Group promotion flow is documented.

---

## M8: Performance Validation and Load Characterization (Directional)

Goal

- Ensure the system remains responsive under realistic MVP usage.

What must be true

- Map interactions feel responsive under representative dataset sizes.
- No unbounded query path exists in normal workflows.
- Dominant query paths have validated index coverage.

Suggested focus areas (not rigid checklist)

- Characterize typical load profiles (users, images, map density).
- Run representative retrieval/filter scenarios.
- Document observed bottlenecks and practical mitigations.

Success condition

- Team can explain current performance envelope and known limits with evidence.

## M9: Evolution Readiness and Scope Expansion Guardrails (Directional)

Goal

- Enable safe expansion beyond strict MVP without breaking core invariants.

What must be true

- Scope expansion proposals reference existing invariants and non-goals.
- Any schema-affecting change includes migration and rollback thinking.
- New use cases map back to existing security and data boundaries.

Suggested focus areas (not rigid checklist)

- Add highest-value operational use cases (e.g., supervisor review, metadata stewardship).
- Document where current architecture supports growth and where it does not.
- Keep post-MVP features clearly marked as non-blocking.

Success condition

- New scope can be added deliberately without destabilizing MVP commitments.

## M10: Release Readiness and Ongoing Governance (Directional)

Goal

- Establish lightweight but reliable release discipline.

What must be true

- Release readiness includes security verification, functional verification, and performance verification.
- High-impact changes are traceable to affected docs and decisions.
- Invariant drift and ADR drift are reviewed on a recurring cadence.

Suggested focus areas (not rigid checklist)

- Keep a minimal release gate checklist.
- Keep a lightweight change-impact template.
- Run periodic doc consistency reviews.

Success condition

- Releases are predictable, and governance reduces risk without blocking delivery velocity.

---

## Implementation Milestone Index

These milestones track actual code delivery. They depend on design milestones M1–M7a being complete.

| ID       | Name                              | Status  | Depends On        |
| -------- | --------------------------------- | ------- | ----------------- |
| M-IMPL1  | Project Bootstrap                 | ✅ Done | M1–M4             |
| M-IMPL2  | Auth Layer                        | ✅ Done | M-IMPL1, M2       |
| M-IMPL3  | Map Shell                         | ✅ Done | M-IMPL2, M5       |
| M-IMPL4  | Photo Ingestion Pipeline          | ✅ Done | M-IMPL3, M6       |
| M-IMPL4a | Upload Bug Fixes & Direction EXIF | ✅ Done | M-IMPL4           |
| M-IMPL4b | Upload Polish                     | ✅ Done | M-IMPL4a          |
| M-IMPL4c | Design System & Tailwind Setup    | ✅ Done | M-IMPL4b          |
| M-IMPL5  | Filter + Retrieval UI             | 🔲 Next | M-IMPL4c, M7, M7a |

---

## M-IMPL1: Project Bootstrap ✅

Goal

- Live Supabase project wired into Angular; app compiles and builds.

Files

- `apps/web/src/app/core/supabase.service.ts`
- `apps/web/src/environments/environment.ts`
- `apps/web/src/environments/environment.development.ts`
- `apps/web/angular.json` (fileReplacements)
- `supabase/migrations/` (6 migrations)

TODOs

- [x] Create Supabase project (remote `yvvzbpnoesxlzlbomlkv`). (AI, 2026-03-03)
- [x] Install `@supabase/supabase-js` in `apps/web`. (AI, 2026-03-03)
- [x] Create `SupabaseService` with typed `client`. (AI, 2026-03-03)
- [x] Wire environment files with `fileReplacements` in `angular.json`. (AI, 2026-03-03)
- [x] Push 6 migrations: extensions, tables, indexes, triggers, RLS, seed. (AI, 2026-03-03)
- [x] Verify `ng build --configuration development` passes. (AI, 2026-03-04)

Acceptance criteria

- `ng build` exits 0 with no TypeScript errors.
- `SupabaseService` constructs a live client from environment config.
- All 6 migrations are applied on remote Supabase.

---

## M-IMPL2: Auth Layer ✅

Goal

- End-to-end authentication: sign-in, register, password reset, session persistence, route guards. All paths covered by tests.

Files

- `apps/web/src/app/core/auth.service.ts`
- `apps/web/src/app/core/auth.service.spec.ts`
- `apps/web/src/app/core/auth.guard.ts`
- `apps/web/src/app/core/auth.guard.spec.ts`
- `apps/web/src/app/features/auth/login/`
- `apps/web/src/app/features/auth/register/`
- `apps/web/src/app/features/auth/reset-password/`
- `apps/web/src/app/features/auth/update-password/`
- `apps/web/src/app/app.routes.ts`
- `apps/web/src/app/app.config.ts`

TODOs

- [x] Create `AuthService` with signals-based session, `APP_INITIALIZER`, and all auth calls. (AI, 2026-03-03)
- [x] Create `authGuard` and `guestGuard` with loading race-condition fix. (AI, 2026-03-03)
- [x] Create `LoginComponent`. (AI, 2026-03-03)
- [x] Create `RegisterComponent`. (AI, 2026-03-03)
- [x] Create `ResetPasswordComponent`. (AI, 2026-03-03)
- [x] Create `UpdatePasswordComponent`. (AI, 2026-03-03)
- [x] Lazy-load all 4 auth components in `app.routes.ts`. (AI, 2026-03-03)
- [x] Add `APP_INITIALIZER` to `app.config.ts`. (AI, 2026-03-03)
- [x] Fix TypeScript errors from build (`auth.guard.ts` type + wrong import paths). (AI, 2026-03-04)
- [x] Write `auth.service.spec.ts` (18 tests). (AI, 2026-03-04)
- [x] Write `auth.guard.spec.ts` (5 tests). (AI, 2026-03-04)
- [x] Write component specs for all 4 auth components (31 tests). (AI, 2026-03-04)
- [x] All 56 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)

Acceptance criteria

- Build is clean: `ng build --configuration development` exits 0.
- All 56 unit tests pass with no unhandled errors.
- Session signal populates before first route guard runs.
- `PASSWORD_RECOVERY` event routes user to `/auth/update-password`.

---

## M-IMPL3: Map Shell ✅

Goal

- Leaflet map renders at `/`. Authenticated users land on the map; unauthenticated users
  are redirected to `/auth/login`.

Files

- `apps/web/src/app/features/map/map-shell/map-shell.component.ts` (+ html, scss)
- `apps/web/src/app/features/map/map-shell/map-shell.component.spec.ts`
- `apps/web/src/app/app.routes.ts` (map route added)
- `apps/web/angular.json` (Leaflet CSS in styles array)
- `apps/web/public/assets/leaflet/` (marker icons)
- `apps/web/src/styles.scss` (global base styles, full-height)
- `apps/web/src/app/app.html` (replaced scaffold with `<router-outlet />`)

TODOs

- [x] Install `leaflet` and `@types/leaflet` in `apps/web`. (AI, 2026-03-04)
- [x] Add Leaflet CSS to `angular.json` styles array. (AI, 2026-03-04)
- [x] Copy Leaflet marker icons to `public/assets/leaflet/`. (AI, 2026-03-04)
- [x] Create `MapShellComponent`: Leaflet map in `afterNextRender`, `ngOnDestroy` cleanup, OSM tile layer. (AI, 2026-03-04)
- [x] Add `''` route under `authGuard` group lazy-loading `MapShellComponent`. (AI, 2026-03-04)
- [x] Replace default scaffold `app.html` with `<router-outlet />`. (AI, 2026-03-04)
- [x] Add global base styles (full-height html/body/app-root). (AI, 2026-03-04)
- [x] Write `map-shell.component.spec.ts` (3 tests). (AI, 2026-03-04)
- [x] All 58 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)
- [x] Dev server runs; map visible at `http://localhost:4200` after sign-in. (AI, 2026-03-04)

Acceptance criteria

- Navigating to `/` as an authenticated user renders a Leaflet map. ✅
- Navigating to `/` as an unauthenticated user redirects to `/auth/login`. ✅
- Map container element is present in the DOM (`.map-container`). ✅

---

## M-IMPL4: Photo Ingestion Pipeline ✅

Goal

- User can upload images; EXIF coordinates are extracted and persisted; images appear on the map as markers.

Files (planned)

- `apps/web/src/app/features/upload/` (upload component)
- `apps/web/src/app/core/upload.service.ts`
- Supabase Storage bucket `images`

TODOs

- [x] Create Supabase Storage bucket `images` with signed-URL access. (AI, 2026-03-04)
- [x] Install `exifr` for browser-side EXIF parsing. (AI, 2026-03-04)
- [x] Create `UploadService`: validate file (25 MB, MIME), parse EXIF, upload to Storage, insert `images` row. (AI, 2026-03-04)
- [x] Create `UploadPanelComponent`: drag-and-drop or file picker, progress display, error display. (AI, 2026-03-04)
- [x] Show uploaded markers on the map immediately after ingestion. (AI, 2026-03-04)
- [x] Write unit tests for `UploadService` (mock Storage + Supabase insert). (AI, 2026-03-04)
- [x] Write unit tests for `UploadPanelComponent` (30 tests). (AI, 2026-03-04)
- [x] All 119 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)
- [x] `ng build --configuration development` exits 0. (AI, 2026-03-04)

Acceptance criteria

- JPEG / PNG / HEIC with GPS EXIF → marker appears on map. ✅
- Files > 25 MB or wrong MIME are rejected with a user-visible error. ✅
- Missing EXIF → user is prompted to place marker manually. ✅
- Storage URL is signed (not public). ✅

---

## M-IMPL4a: Upload Bug Fixes & Direction EXIF ✅

Goal

- Fix the placement bug (no-GPS images can now be placed on the map), extract GPSImgDirection EXIF data, and add user feedback for placement mode. Full UX audit documented in `docs/archive/audit-upload-map-interaction.md`.

Files

- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.ts`
- `apps/web/src/app/features/map/map-shell/map-shell.component.ts` (+ html, scss)
- `apps/web/src/app/core/upload.service.ts`
- `apps/web/src/app/core/upload.service.spec.ts`
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.spec.ts`
- `apps/web/src/app/features/map/map-shell/map-shell.component.spec.ts`
- `docs/archive/audit-upload-map-interaction.md` (new — 100 UX ideas)
- `docs/features.md` (updated direction spec)
- `docs/decisions.md` (updated D7)

TODOs

- [x] Fix `placementRequested` output missing from `UploadPanelComponent`. (AI, 2026-03-04)
- [x] Wire `(placementRequested)="enterPlacementMode($event)"` in `map-shell.component.html`. (AI, 2026-03-04)
- [x] Add placement mode banner + crosshair cursor + cancel button. (AI, 2026-03-04)
- [x] Extract `GPSImgDirection` in `parseExif()` and persist `direction` in DB insert. (AI, 2026-03-04)
- [x] Add `direction` to `ParsedExif`, `UploadSuccess`, and the DB insert. (AI, 2026-03-04)
- [x] Write 12 new tests (direction EXIF, placement mode, placementRequested output). (AI, 2026-03-04)
- [x] All 131 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)
- [x] `ng build` exits 0. (AI, 2026-03-04)
- [x] Create `docs/archive/audit-upload-map-interaction.md` — 100 UX ideas for upload/map/direction. (AI, 2026-03-04)
- [x] Update `features.md` and `decisions.md` to reflect direction is now persisted and will be exposed. (AI, 2026-03-04)

Acceptance criteria

- No-GPS images: "📍 Place on map" triggers placement mode with banner + crosshair. ✅
- Clicking the map during placement mode places the image and removes the banner. ✅
- Cancel button exits placement mode without placing. ✅
- GPSImgDirection is extracted from EXIF and stored in the `direction` column. ✅
- Direction values outside 0–360 or non-numeric are rejected (stored as NULL). ✅
- 131 tests pass, `ng build` clean. ✅

---

## M-IMPL4b: Upload Polish ✅

Goal

- Eliminate performance waste and UX gaps in the upload pipeline: no double EXIF parse, direction surfaced to the map layer, retry for failures, thumbnail preview, and dismissal of stuck awaiting-placement items.

Files

- `apps/web/src/app/core/upload.service.ts`
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.ts`
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.html`
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.scss`

TODOs

- [x] Eliminate double EXIF parse: add `parsedExif?: ParsedExif` to `uploadFile()`; `processFile()` caches result in `FileUploadState` and passes it through. (AI, 2026-03-04)
- [x] Add `direction?: number` to `ImageUploadedEvent` so the map can render direction cones without a Supabase re-fetch. (AI, 2026-03-04)
- [x] Add `retryFile(key)` method; add retry button (`↺ Retry`) in the HTML for error-state items. (AI, 2026-03-04)
- [x] Show inline thumbnail preview (`URL.createObjectURL`) in each upload-queue row; revoke on dismiss / `ngOnDestroy`. (AI, 2026-03-04)
- [x] Fix awaiting-placement items getting stuck when placement is cancelled: add dismiss button for `awaiting_placement` state. (AI, 2026-03-04)
- [x] Update grid layout in SCSS to accommodate thumbnail column (5-column grid). (AI, 2026-03-04)
- [x] Implement `OnDestroy` in `UploadPanelComponent` to revoke all object URLs. (AI, 2026-03-04)
- [x] All 131 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)
- [x] `ng build --configuration development` exits 0. (AI, 2026-03-04)

Acceptance criteria

- `UploadService.uploadFile()` never calls `parseExif()` when a `ParsedExif` result is supplied by the caller. ✅
- `ImageUploadedEvent.direction` carries the EXIF direction value when available. ✅
- Failed items show a retry button; clicking it resets to `pending` and re-queues. ✅
- Each uploaded file shows a thumbnail preview immediately on enqueue. ✅
- Awaiting-placement items can be dismissed (× button) and do not get permanently stuck in the panel. ✅
- 131 tests pass, `ng build` clean. ✅

---

## M-IMPL4c: Design System & Tailwind Setup ✅

Goal

- Establish Tailwind CSS as the sole styling foundation with an explicit design-token contract.
- Redesign the left sidebar (NavComponent) and map shell UI per the new layout spec.
- Unify dark mode strategy and document it for every future component.

Files

- `apps/web/tailwind.config.js` (new)
- `apps/web/postcss.config.js` (new)
- `apps/web/src/styles.scss`
- `apps/web/src/app/features/nav/nav.component.ts`
- `apps/web/src/app/features/nav/nav.component.html`
- `apps/web/src/app/features/nav/nav.component.scss`
- `apps/web/src/app/features/nav/nav.component.spec.ts`
- `apps/web/src/app/features/map/map-shell/map-shell.component.ts`
- `apps/web/src/app/features/map/map-shell/map-shell.component.html`
- `apps/web/src/app/features/map/map-shell/map-shell.component.scss`
- `apps/web/src/app/features/map/map-shell/map-shell.component.spec.ts`
- `docs/decisions.md` (D9 updated)
- `docs/setup-guide.md` (§6 added)
- `apps/web/src/index.html` (Material Icons CDN)

TODOs

- [x] Install Tailwind CSS v3 + PostCSS + Autoprefixer in `apps/web`. (AI, 2026-03-04)
- [x] Create `tailwind.config.js` with semantic radius tokens (pill/card/input), spacing aliases, color tokens referencing CSS custom properties, min-h-tap/min-w-tap interactive target helpers, and `darkMode: ['class', '[data-theme="dark"']`. (AI, 2026-03-04)
- [x] Create `postcss.config.js` with `tailwindcss` and `autoprefixer` plugins. (AI, 2026-03-04)
- [x] Add `@tailwind base/components/utilities` directives to top of `styles.scss`. (AI, 2026-03-04)
- [x] Redesign NavComponent: Material Icons, pill sidebar (0.5rem collapsed → 11rem expanded), 1rem fixed `border-radius`, golden-ratio height, frosted glass panel. (AI, 2026-03-04)
- [x] Redesign MapShellComponent: upload button top-right, unified expanding search bar (single box, no separate dropdown), GPS button with active re-request on every click. (AI, 2026-03-04)
- [x] Add Material Icons CDN link to `index.html`. (AI, 2026-03-04)
- [x] Update D9 in `decisions.md` with utility-first rules, arbitrary-value prohibition, and 38px tap-target requirement. (AI, 2026-03-04)
- [x] Document Tailwind setup, dark mode, and token table in `setup-guide.md §6`. (AI, 2026-03-04)
- [x] All 157 tests pass (`ng test --no-watch` exits 0). (AI, 2026-03-04)
- [x] `ng build --configuration development` exits 0. (AI, 2026-03-04)

Acceptance criteria

- `ng build` exits 0 with Tailwind JIT active (style output contains Tailwind preflight). ✅
- `tailwind.config.js` defines `pill`, `card`, `input` border-radius tokens. ✅
- `dark:` utilities activate on `[data-theme="dark"]` attribute on `<html>`. ✅
- NavComponent: pill handle (0.5rem wide) visible at all times; expands to full nav on hover. ✅
- SearchBar: single expanding container, no separate dropdown overlay. ✅
- GPS button actively re-requests geolocation on every click. ✅
- 157 tests pass. ✅

---

## M-IMPL5: Filter + Retrieval UI 🔲

Goal

- Users can filter markers by project, date range, and metadata. Map viewport controls what is fetched. Pagination is cursor-based.

Files (planned)

- `apps/web/src/app/features/map/filter-panel/`
- `apps/web/src/app/core/images.service.ts`

TODOs

- [ ] Create `ImagesService`: viewport-bounded PostGIS query, cursor pagination, abort on viewport change.
- [ ] Create `FilterPanelComponent`: project, date range, metadata key/value filters.
- [ ] Wire filter state into viewport query (debounced).
- [ ] Write tests for `ImagesService` (mock Supabase RPC / select).

Acceptance criteria

- Map shows only markers within current viewport (PostGIS-filtered).
- Filter combinations use AND semantics.
- Pagination loads 50 markers per page via cursor.
- Changing viewport or filters aborts the in-flight request.

---

## M-IMPL6: Search Experience Implementation 🔲

Goal

- Implement the full search behavior contract from `docs/search-experience-spec.md` with DB-first ranking, mixed result families, keyboard-first interaction, and map/filter integration.

Files (planned)

- `docs/search-experience-spec.md`
- `apps/web/src/app/core/search/search.models.ts`
- `apps/web/src/app/core/search/search-orchestrator.service.ts`
- `apps/web/src/app/core/address-resolver.service.ts`
- `apps/web/src/app/core/geocoding.adapter.ts` (if extraction is needed)
- `apps/web/src/app/features/map/map-shell/map-shell.component.ts`
- `apps/web/src/app/features/map/map-shell/map-shell.component.html`
- `apps/web/src/app/features/map/map-shell/map-shell.component.scss`
- `apps/web/src/app/features/map/map-shell/map-shell.component.spec.ts`

TODOs

- [ ] Freeze open decisions in `docs/search-experience-spec.md` §12 (debounce, command visibility, MVP DB content scope, live marker highlight timing).
- [ ] Add typed search contracts (`SearchQueryContext`, candidate families, commit actions, state enums).
- [ ] Create `SearchOrchestratorService` for debounce, abort-previous, cache TTL, parallel source querying, and merged output.
- [ ] Implement DB-first resolver path and external geocoder path via provider-agnostic adapter.
- [ ] Implement ranking + dedupe rules (DB-first order, within-family ordering, geocoder dedupe within 30m).
- [ ] Refactor map search UI to explicit states: `Idle`, `FocusedEmpty`, `Typing`, `ResultsPartial`, `ResultsComplete`, `Committed`.
- [ ] Add explicit committed-state clear control (`×`) in the search input; clear query + committed target while preserving active filters.
- [ ] Add recent searches persistence (deduped MRU list with cap) and clear/commit behavior.
- [x] Add forgiving address matching rollout A+B in map search (normalization + fallback query pass) with explicit "Did you mean …?" suggestion row. (AI, 2026-03-04)
- [ ] Implement keyboard contract (`Cmd/Ctrl+K`, arrows, Enter, Escape, Backspace on empty committed query).
- [ ] Implement accessibility contract (`listbox`/`option`, separator presentation roles, announcements).
- [ ] Integrate search commit with map centering and distance-reference update without implicit filter resets.
- [ ] Add telemetry events (query submit, selected family/type, zero-result recovery, source latency).
- [ ] Add unit + integration tests for ranking, merge stability, keyboard interactions, and commit outcomes.

Acceptance criteria

- Search returns sectioned results with deterministic DB-first ordering.
- Place commits recenter/fit map and preserve query for refinement.
- Keyboard-only flow works end-to-end with expected shortcut and navigation semantics.
- Search respects active filters and does not reset them unless user explicitly clears.
- No-result and slow/failing source states are non-blocking with recovery actions.
- `ng build` exits 0 and affected tests pass.

---

## UI Implementation Milestone Index

These milestones cover the full visual design and front-end layout work. They run in parallel with or after M-IMPL5. Every milestone targets a specific page or system; they can be executed in the order below.

| ID    | Name                          | Status         | Depends On      |
| ----- | ----------------------------- | -------------- | --------------- |
| M-UI1 | Design System Foundation      | ✅ Done        | M-IMPL1         |
| M-UI2 | App Shell & Navigation        | ✅ Done        | M-UI1           |
| M-UI3 | Map Page – Split Layout       | ✅ Done        | M-UI2, M-IMPL3  |
| M-UI4 | Map Page – Side Panel         | 🔲 Not started | M-UI3           |
| M-UI5 | Map Page – Upload Entry Point | 🔲 Not started | M-UI3, M-IMPL4b |
| M-UI6 | Photos Page                   | 🔲 Not started | M-UI2           |
| M-UI7 | Groups Page                   | 🔲 Not started | M-UI2           |
| M-UI8 | Settings Page                 | 🔲 Not started | M-UI2           |
| M-UI9 | Account Page                  | 🔲 Not started | M-UI2           |

---

## M-UI1: Design System Foundation ✅ Done

Goal

- Replace ad-hoc styles with a single source of truth: CSS custom properties for every color, spacing, radius, and shadow token from `docs/design/tokens.md`.

Files

- `apps/web/src/styles.scss` — global token definitions and reset
- `apps/web/src/app/app.scss` — remove old one-off styles

TODOs

- [x] Define all `--color-*` tokens (light + dark) from `docs/design/tokens.md` in `:root` and `[data-theme="dark"]`. (AI, 2026-03-04)
- [x] Define `--radius-*`, `--shadow-*`, `--spacing-*`, and `--font-*` scale tokens. (AI, 2026-03-04)
- [x] Add `prefers-color-scheme` media-query fallback alongside `[data-theme]` selector. (AI, 2026-03-04)
- [x] Audit existing component `.scss` files and replace raw hex values with tokens. (AI, 2026-03-04)
- [x] Confirm `ng build` and all tests pass after token rollout. (AI, 2026-03-04)

Acceptance criteria

- No raw hex colour values remain in any component stylesheet.
- Dark mode applies automatically from system preference and via `[data-theme="dark"]` on `<html>`.
- Token names match exactly the names used in `docs/design/tokens.md` so they are cross-referenceable.

---

## M-UI2: App Shell & Navigation ✅ Done

Goal

- Create the persistent app shell: a narrow icon sidebar on the left for page-level navigation. Pages not yet implemented are present but visually disabled (greyed out, non-interactive).

Layout

```
┌──┬─────────────────────────────────┐
│  │                                 │
│  │   <router-outlet>               │
│nav│                                 │
│  │                                 │
└──┴─────────────────────────────────┘
```

Pages and nav items (in order):

| Icon  | Label    | Route       | Status     |
| ----- | -------- | ----------- | ---------- |
| 🗺    | Map      | `/`         | Active     |
| 📷    | Photos   | `/photos`   | Active     |
| 📁    | Groups   | `/groups`   | Active     |
| ⚙️    | Settings | `/settings` | Active     |
| 👤    | Account  | `/account`  | Active     |
| (TBD) | Future   | —           | Greyed out |

Files

- `apps/web/src/app/app.html` — add `<app-nav>` alongside `<router-outlet>`
- `apps/web/src/app/features/nav/nav.component.ts` (+ html, scss)
- `apps/web/src/app/app.routes.ts` — add placeholder routes for all pages

TODOs

- [x] Create `NavComponent`: icon-only vertical sidebar, active-link highlight, tooltips on hover. (AI, 2026-03-04)
- [x] Add a `disabled` variant: greyed-out items with `pointer-events: none` and a "Coming soon" tooltip. (AI, 2026-03-04)
- [x] Wire lazy-loaded routes for `/photos`, `/groups`, `/settings`, `/account` (placeholder shell components for now). (AI, 2026-03-04)
- [x] Nav collapses to a bottom tab bar on mobile (< 768 px breakpoint). (AI, 2026-03-04)
- [x] Write unit tests for `NavComponent` (active route, disabled state). (AI, 2026-03-04)

Acceptance criteria

- All five nav items are present and navigable.
- Active page is visually highlighted.
- Disabled/future items are visually distinct and non-interactive.
- Nav tab bar appears on mobile; icon sidebar on desktop.

---

## M-UI3: Map Page – Split Layout ✅ Done

Goal

- Implement the two-pane map layout: a collapsible left panel and a full-height right map pane.
- **At rest** the panel collapses to a narrow strip (~12–16 px) at the left edge — barely visible, non-intrusive.
- **On hover** the strip expands to the full panel width quickly (120 ms ease-out). The panel stays open while the cursor is inside it and collapses again when the cursor leaves and no marker is selected.
- **When a marker is selected** (M-UI4) the panel stays open regardless of hover state; a close button (×) in the header is the only way to dismiss it.

States

```
At rest (no hover, no selection):
┌──┬──────────────────────────────────────────┐
│▌ │            map pane (full)               │
│  │         [search bar top-center]          │
│  │                Leaflet                   │
│  │                                          │
└──┴──────────────────────────────────────────┘
  ↑ ~14 px strip

On hover / marker selected:
┌────────────────┬─────────────────────────────┐
│  side panel    │        map pane              │
│  320 px wide   │    [search bar]              │
│                │                              │
│                │         Leaflet              │
│                │                              │
└────────────────┴─────────────────────────────┘
```

Files

- `apps/web/src/app/features/map/map-shell/map-shell.component.ts` (+ html, scss)

TODOs

- [x] Convert `MapShellComponent` to a CSS Flexbox row with a left panel and a map column. (AI, 2026-03-04)
- [x] Left panel has two CSS states: `collapsed` (width: 14 px, overflow hidden) and `expanded` (width: 320 px). Transition: `width 120ms ease-out`. (AI, 2026-03-04)
- [x] Panel expands on `mouseenter` and collapses on `mouseleave` unless `panelPinned()` signal is true. (AI, 2026-03-04)
- [x] `panelPinned` is set to `true` when a marker is selected (M-UI4) and `false` when deselected or the × close button is clicked. (AI, 2026-03-04)
- [x] The collapsed strip has a subtle visual affordance: a faint `--color-border` right edge and a centred drag-bar pill (like a browser scrollbar thumb) so users know it is interactive. (AI, 2026-03-04)
- [x] Map pane always occupies remaining width; Leaflet `invalidateSize()` is called after every expand/collapse transition ends (`transitionend` event). (AI, 2026-03-04)
- [x] Pin the search bar inside the **left panel header**; it is only visible when the panel is expanded. (AI, 2026-03-04)
- [x] Write tests: hover opens, mouseleave closes, pinned state prevents close, `invalidateSize` called on transition end. (AI, 2026-03-04)

Acceptance criteria

- Panel collapses to a ~14 px strip at rest; no layout shift on the map pane.
- Hovering the strip expands the panel in ≤ 120 ms.
- Moving the cursor off the panel collapses it unless a marker is selected.
- With a marker selected, the panel stays open; × button closes and un-pins it.
- Map reflows with no grey tiles after every expand/collapse.
- Search bar is visible only in the expanded state.

---

## M-UI4: Map Page – Side Panel Content

Goal

- When the user clicks a marker or a cluster, the side panel opens and shows the selected image(s) metadata, thumbnail, and available actions. Clicking elsewhere on the map or the close button collapses it.

Panel sections (single marker selected):

```
┌──────────────────────────┐
│ ×   [image title / name] │  ← header
├──────────────────────────┤
│ [thumbnail]              │
│ coordinates              │
│ captured_at              │
│ direction (if present)   │
│ correction indicator     │
├──────────────────────────┤
│ [Edit location]  [Group] │  ← ghost action buttons
└──────────────────────────┘
```

Cluster selected → shows a scrollable list of thumbnail cards (same layout as Photos page).

Files

- `apps/web/src/app/features/map/map-shell/` (extend)
- `apps/web/src/app/features/map/image-detail-panel/` (new component)

TODOs

- [ ] Create `ImageDetailPanelComponent`: thumbnail, metadata rows (property-style from `docs/element-specs/image-detail-view.md`), action buttons.
- [ ] Pass selected marker data from `MapShellComponent` into the panel via `@Input` or signal.
- [ ] Clicking a map marker: set selected marker signal → open panel.
- [ ] Clicking the map background (not a marker): clear selected → close panel.
- [ ] Cluster click: open panel with list view for clustered photos (optional zoom-in), using proximity-based clustering rules.
- [ ] Show a correction indicator badge if `coordinate_corrections` entry exists for the image.
- [ ] Panel header shows image count badge when cluster is selected.
- [ ] Write unit tests for `ImageDetailPanelComponent`.

Acceptance criteria

- Single marker click opens panel with correct metadata.
- Map background click closes panel.
- Cluster click shows list view in panel for proximity clusters (independent of fixed zoom tiers).
- Correction indicator appears when applicable.
- Panel open/close preserves map zoom and position.

---

## M-UI5: Map Page – Upload Entry Point

Goal

- Implement the upload button from the mockup: a persistent button anchored to the **top-right of the map pane**. On hover it previews the upload panel; on click it fully opens the upload panel, which expands to the left and downward from the button. The panel is a drop target.

Button + panel behavior:

- At rest: compact icon button (upload icon, `--color-clay` fill per `docs/design/tokens.md`).
- On hover: panel previews at reduced opacity (ghost expand) — button stays rendered.
- On click / drag-over: panel animates fully open (expands left and down from button anchor).
- Upload panel stays open after files are added; close button or clicking away dismisses it.

Files

- `apps/web/src/app/features/map/map-shell/map-shell.component.html` (+ scss)
- `apps/web/src/app/features/upload/upload-panel/upload-panel.component.ts` (+ html, scss)

TODOs

- [x] Anchor upload button to `position: fixed; top: var(--spacing-3); right: var(--spacing-3)` in the map shell overlay. (AI, 2026-03-04)
- [ ] Add hover expand animation: `max-height` / `opacity` transition (120 ms) previewing a ghost panel.
- [ ] On click: panel fully open with drag-and-drop drop zone + file picker button.
- [ ] Panel expands left and down; never obscures the upload button itself.
- [ ] `dragover` on map pane (not just the panel) also opens the panel to guide the user.
- [ ] Panel close: `×` button, or clicking outside the panel area, or `Escape`.
- [ ] Write/update tests for new trigger states.

Acceptance criteria

- Upload button is visible in map pane top-right at all times.
- Hovering shows a ghost expansion of the panel.
- Clicking opens the full panel.
- Dragging a file over the map pane triggers the panel open.
- Panel opens left+down and does not clip off-screen.

---

## M-UI6: Photos Page

Goal

- A dedicated page (`/photos`) showing all of the authenticated user's uploaded images as a responsive thumbnail grid. Supports filtering and bulk selection.

Layout

```
┌─────────────────────────────────────────┐
│  [active filter chips strip]            │
├─────────────────────────────────────────┤
│  [filter panel — collapsed by default]  │
├──────┬──────┬──────┬──────┬─────────────┤
│ card │ card │ card │ card │  ...        │
│ card │ card │ card │ card │             │
└──────┴──────┴──────┴──────┴─────────────┘
```

Card content (from `docs/element-specs/workspace-pane.md`): thumbnail, timestamp, location name, one primary tag — no more.

Files

- `apps/web/src/app/features/photos/photos.component.ts` (+ html, scss)
- `apps/web/src/app/features/photos/photo-card/photo-card.component.ts` (+ html, scss)

TODOs

- [ ] Create `PhotosComponent`: responsive grid (auto-fill, min 180 px column), cursor-paginated scroll.
- [ ] Create `PhotoCardComponent`: thumbnail (lazy-loaded), timestamp, metadata badge. Actions (checkbox, group-add, `⋯`) hidden at rest, revealed on hover (design.md §1.8).
- [ ] Add inline filter chips strip (active filters visible at all times above grid).
- [ ] Add collapsible filter panel (date range, project, metadata key/value).
- [ ] Bulk-select mode: entering it via checkbox click shows a floating action bar (add to group, delete).
- [ ] Empty state: "Nothing here yet — start by uploading your first site photo." with upload CTA.
- [ ] Write unit tests.

Acceptance criteria

- All uploaded photos are shown in the grid.
- Filter chips reflect active filters; removing a chip updates the grid.
- Bulk-select mode shows action bar.
- Empty state renders when no images exist.

---

## M-UI7: Groups Page

Goal

- A dedicated page (`/groups`) showing the user's saved groups (collections of images). Groups can be created, renamed, and deleted. Clicking a group shows its images in the same grid layout as the Photos page.

Files

- `apps/web/src/app/features/groups/groups.component.ts` (+ html, scss)
- `apps/web/src/app/features/groups/group-detail/group-detail.component.ts` (+ html, scss)

TODOs

- [ ] Groups list view: card per group (cover thumbnail, name, image count, last updated).
- [ ] Inline rename: clicking the group name activates an inline text input (Notion-style property edit, `docs/archive/reference-products.md` §2.10).
- [ ] Create group: "+ New group" button at top of list.
- [ ] Delete group: context menu (`⋯`) with confirmation.
- [ ] Group detail view: same thumbnail grid as Photos page, filtered to the group.
- [ ] Empty state for groups list: "You haven't created any groups yet."
- [ ] Empty state for group detail: "This group is empty — add images from the Photos page or the map."
- [ ] Write unit tests.

Acceptance criteria

- Groups list shows all saved groups with cover thumbnail and count.
- Rename and delete work inline without full-page navigation.
- Group detail shows correct images from `saved_group_images`.

---

## M-UI8: Settings Page

Goal

- A dedicated page (`/settings`) for application preferences. MVP scope: theme toggle (light / dark / system), map tile style preference, and notification placeholders.

Files

- `apps/web/src/app/features/settings/settings.component.ts` (+ html, scss)

TODOs

- [ ] Theme toggle: light / dark / system — writes to `localStorage` and applies `[data-theme]` to `<html>`.
- [ ] Map tile style preference (placeholder for now — only one style available in MVP).
- [ ] Greyed-out placeholder sections for future settings (notifications, integrations) with "Coming soon" label.
- [ ] Settings are persisted in `localStorage`; applied on `APP_INITIALIZER` before first render.
- [ ] Write unit tests for theme toggle signal.

Acceptance criteria

- Theme toggle switches between light, dark, and system.
- Preference persists across page reload.
- Greyed-out future sections are present and non-interactive.

---

## M-UI9: Account Page

Goal

- A dedicated page (`/account`) showing the authenticated user's profile and providing account management actions: update email, update password, delete account.

Files

- `apps/web/src/app/features/account/account.component.ts` (+ html, scss)

TODOs

- [ ] Display current email and user metadata from `AuthService`.
- [ ] "Change password" form: calls `AuthService.updatePassword()`.
- [ ] "Change email" form: calls Supabase `updateUser` with new email; shows confirmation message.
- [ ] "Delete account" button: two-step confirmation (inline, not modal), calls `AuthService.deleteAccount()`.
- [ ] Write unit tests (mock `AuthService` with spies).

Acceptance criteria

- User can see their current email.
- Password and email change flows work end-to-end.
- Delete account requires explicit confirmation before calling the service.

---

## Implementation Readiness

For a consolidated view of implementation maturity across all feature groups and use cases — with scores, gap analysis, and a prioritized top-10 list — see **`implementation-readiness.md`**.

That document is the single source of truth for "how far along are we?". This file (`milestones.md`) tracks _when_ work is planned; `implementation-readiness.md` tracks _current state_.

---

## AI-Friendly Readability Rules

- Keep milestone headers stable: `## Mx: Name`.
- Keep deterministic milestones concrete and checkable.
- Keep directional milestones outcome-oriented.
- Keep terminology aligned with `docs/glossary.md`.
