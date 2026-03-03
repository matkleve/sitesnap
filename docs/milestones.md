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
- `docs/use-cases.md`

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
- `docs/use-cases.md`

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
- `docs/use-cases.md`
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
- `docs/use-cases.md`
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
- `docs/use-cases.md` (UC1, UC2)

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

| ID       | Name                            | Status      | Depends On           |
| -------- | ------------------------------- | ----------- | -------------------- |
| M-IMPL1  | Project Bootstrap               | ✅ Done     | M1–M4                |
| M-IMPL2  | Auth Layer                      | ✅ Done     | M-IMPL1, M2          |
| M-IMPL3  | Map Shell                       | 🔲 Next     | M-IMPL2, M5          |
| M-IMPL4  | Photo Ingestion Pipeline        | 🔲 Pending  | M-IMPL3, M6          |
| M-IMPL5  | Filter + Retrieval UI           | 🔲 Pending  | M-IMPL4, M7, M7a     |

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

## M-IMPL3: Map Shell 🔲

Goal

- Leaflet map renders at `/`. Authenticated users land on the map; unauthenticated users
  are redirected to `/auth/login`.

Files

- `apps/web/src/app/features/map/map-shell/map-shell.component.ts` (+ html, scss)
- `apps/web/src/app/features/map/map-shell/map-shell.component.spec.ts`
- `apps/web/src/app/app.routes.ts` (add map route)

TODOs

- [ ] Install `leaflet` and `@types/leaflet` in `apps/web`.
- [ ] Create `MapShellComponent`: initialise Leaflet map in `afterNextRender`, default view to world.
- [ ] Add `{ path: '', component: MapShellComponent }` under the `authGuard` route group.
- [ ] Write spec: map container element exists, component creates.
- [ ] Verify `ng build` and `ng test` still pass.

Acceptance criteria

- Navigating to `/` as an authenticated user renders a Leaflet map.
- Navigating to `/` as an unauthenticated user redirects to `/auth/login`.
- Map container element is present in the DOM (`#map` or equivalent).

---

## M-IMPL4: Photo Ingestion Pipeline 🔲

Goal

- User can upload images; EXIF coordinates are extracted and persisted; images appear on the map as markers.

Files (planned)

- `apps/web/src/app/features/upload/` (upload component)
- `apps/web/src/app/core/upload.service.ts`
- Supabase Storage bucket `images`

TODOs

- [ ] Create Supabase Storage bucket `images` with signed-URL access.
- [ ] Install `exifr` for browser-side EXIF parsing.
- [ ] Create `UploadService`: validate file (25 MB, MIME), parse EXIF, upload to Storage, insert `images` row.
- [ ] Create `UploadPanelComponent`: drag-and-drop or file picker, progress display, error display.
- [ ] Show uploaded markers on the map immediately after ingestion.
- [ ] Write unit tests for `UploadService` (mock Storage + Supabase insert).

Acceptance criteria

- JPEG / PNG / HEIC with GPS EXIF → marker appears on map.
- Files > 25 MB or wrong MIME are rejected with a user-visible error.
- Missing EXIF → user is prompted to place marker manually.
- Storage URL is signed (not public).

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

## AI-Friendly Readability Rules

- Keep milestone headers stable: `## Mx: Name`.
- Keep deterministic milestones concrete and checkable.
- Keep directional milestones outcome-oriented.
- Keep terminology aligned with `docs/glossary.md`.
