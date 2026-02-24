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
- Authorization is enforced by PostgreSQL RLS, never by frontend checks alone.
- EXIF coordinates are immutable; corrected coordinates are additive.
- Map retrieval remains viewport-bounded and server-filtered.
- MVP scope remains narrow until explicit expansion.

## Milestone Index
| ID | Name | Type | Depends On |
|---|---|---|---|
| M1 | Product Baseline and Scope Lock | Deterministic | None |
| M2 | Identity, Lifecycle, and Role Integrity | Deterministic | M1 |
| M3 | Schema Finalization for MVP | Deterministic | M2 |
| M4 | Security Boundaries and RLS Policy Spec | Deterministic | M3 |
| M5 | Map and Geocoding Behavior Contract | Deterministic | M1, M3 |
| M6 | Ingestion and Marker Correction Pipeline | Deterministic | M3, M4 |
| M7 | Filter and Retrieval Semantics | Deterministic | M5, M6 |
| M8 | Performance Validation and Load Characterization | Directional | M7 |
| M9 | Evolution Readiness and Scope Expansion Guardrails | Directional | M1-M8 |
| M10 | Release Readiness and Ongoing Governance | Directional | M4, M8, M9 |

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
- [ ] Document registration trigger behavior for profile + default role.
- [ ] Document prevention of zero-role users.
- [ ] Document prevention of removing the last admin.
- [ ] Add lifecycle verification checklist to setup guide.

Acceptance criteria
- Lifecycle invariants are explicit and testable.
- Edge cases (zero-role user, last admin) are covered end-to-end.

## M3: Schema Finalization for MVP
Goal
- Finalize schema contract so MVP implementation is unblockable.

Files
- `docs/database-schema.md`

TODOs
- [ ] Confirm all MVP tables and critical relations are listed.
- [ ] Document nullability and FK delete behavior for key columns.
- [ ] Document coordinate precedence (`corrected` then `EXIF`).
- [ ] Add recommended guardrails/check constraints.

Acceptance criteria
- No unresolved schema ambiguity for MVP features.
- Core invariants I1-I5 are representable in schema constraints.

## M4: Security Boundaries and RLS Policy Spec
Goal
- Provide complete authorization contract before implementation.

Files
- `docs/security-boundaries.md`
- `docs/setup-guide.md`

TODOs
- [ ] Add explicit policy intent for `projects`, `metadata_keys`, `image_metadata`.
- [ ] Add deny-case examples for unauthorized access.
- [ ] Add storage access policy guidance (signed URL default).
- [ ] Add step-by-step RLS verification workflow.

Acceptance criteria
- Every user/project-scoped table has policy guidance.
- Deny behavior is documented, not only allow behavior.

## M5: Map and Geocoding Behavior Contract
Goal
- Define deterministic map and geocoding behavior for consistent UX and testing.

Files
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/use-cases.md`

TODOs
- [ ] Add geocoding behavior matrix (exact, closest, no match).
- [ ] Add mandatory fallback notice requirement.
- [ ] Add ordering contract (distance asc, timestamp desc).
- [ ] Add UI state contract for loading/error/empty results.

Acceptance criteria
- Geocoding behavior is deterministic for all primary states.
- Ordering and fallback behavior are testable and non-silent.

## M6: Ingestion and Marker Correction Pipeline
Goal
- Define robust upload flow from file selection through spatial persistence.

Files
- `docs/features.md`
- `docs/use-cases.md`
- `docs/database-schema.md`

TODOs
- [ ] Add end-to-end sequence: upload -> EXIF parse -> storage -> image row save.
- [ ] Add missing-EXIF fallback path.
- [ ] Add marker correction persistence contract.
- [ ] Add user-visible error and retry expectations.

Acceptance criteria
- Success and failure branches are both documented.
- EXIF immutability and corrected-coordinate semantics are consistent across docs.

## M7: Filter and Retrieval Semantics
Goal
- Lock filter and retrieval behavior for time/project/metadata/distance.

Files
- `docs/features.md`
- `docs/use-cases.md`
- `docs/database-schema.md`

TODOs
- [ ] Define canonical filter-combination rules.
- [ ] Define pagination defaults and maximum limits.
- [ ] Define distance reference point and edge-case behavior.
- [ ] Add index coverage notes for dominant query paths.

Acceptance criteria
- Filter semantics are implementation-ready and unambiguous.
- Query behavior aligns with index strategy and pagination guardrails.

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
