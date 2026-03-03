# GeoSite Project Milestones

Purpose: project milestone plan for GeoSite that is human-friendly and AI-readable.

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

## AI-Friendly Readability Rules

- Keep milestone headers stable: `## Mx: Name`.
- Keep deterministic milestones concrete and checkable.
- Keep directional milestones outcome-oriented.
- Keep terminology aligned with `docs/glossary.md`.
