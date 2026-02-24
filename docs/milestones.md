# GeoSite Project Milestones

Purpose: execution-ready project milestone plan that is human-friendly and AI-readable.

How to use this file
- Treat each milestone as a release gate, not just a topic list.
- Do milestones in order unless a dependency note says parallel work is safe.
- For every completed TODO, add the date and owner next to the checkbox.
- If a milestone changes invariants, schema shape, or dependencies, update `docs/decisions.md`.
- Keep terminology aligned with `docs/glossary.md`.

Global project constraints
- Security enforcement is database-first (RLS), never frontend-only.
- EXIF coordinates are immutable; corrections are additive.
- Map queries must be viewport-bounded and server-side filtered.
- MVP scope is intentionally narrow; avoid adding non-goals before M8.

Definition of done (applies to all milestones)
- Scope, behavior, and constraints documented.
- Implementation path is testable from docs.
- Acceptance criteria are objectively pass/fail.
- Open risks and follow-ups are captured.

## Milestone 1: Product Baseline and Scope Lock
Goal
- Freeze MVP contract so engineering decisions stay consistent.

Dependencies
- None.

Instructions
- Reconcile contradictions across `docs/project-description.md`, `docs/features.md`, and `docs/use-cases.md`.
- Ensure every MVP feature maps to at least one use case.
- Ensure non-goals are explicit and consistent.

TODOs
- [ ] Build a feature-to-use-case mapping table in `docs/features.md`.
- [ ] Add a short "MVP contract" section in `docs/project-description.md`.
- [ ] Confirm all references to non-goals match `docs/project-description.md`.
- [ ] Add unresolved scope questions at the end of `docs/features.md`.

Acceptance criteria
- No conflicts between MVP feature list and use-case list.
- At least one use case exists for every MVP feature group.
- Non-goals are consistent across all product docs.

## Milestone 2: Identity, Lifecycle, and Role Integrity
Goal
- Make user creation, role assignment, and deletion behavior unambiguous and safe.

Dependencies
- Milestone 1.

Instructions
- Tighten lifecycle invariants in `docs/user-lifecycle.md`.
- Align lifecycle notes with schema constraints in `docs/database-schema.md`.
- Validate role edge-case rules in `docs/security-boundaries.md`.

TODOs
- [ ] Document trigger behavior for profile + default role creation.
- [ ] Add explicit edge case: prevent user with zero roles.
- [ ] Add explicit edge case: prevent last admin removal.
- [ ] Add lifecycle test checklist to `docs/setup-guide.md`.

Acceptance criteria
- User lifecycle invariants are explicit and testable.
- Role assignment/revocation safety rules are documented end-to-end.
- Deletion behavior has no orphan-data ambiguity.

## Milestone 3: Schema Finalization for MVP
Goal
- Lock schema details needed for all MVP behaviors.

Dependencies
- Milestone 2.

Instructions
- Finalize required columns and constraints in `docs/database-schema.md`.
- Add missing uniqueness/foreign key assumptions.
- Clarify effective coordinate logic and temporal fallback in one canonical place.

TODOs
- [ ] Confirm all required MVP tables are listed and scoped.
- [ ] Add explicit nullability and FK behavior notes for critical columns.
- [ ] Document effective coordinate precedence (corrected > EXIF).
- [ ] Add schema-level guardrails section (recommended constraints/checks).

Acceptance criteria
- No schema ambiguity blocks implementation.
- All core invariants I1-I5 are representable in schema and constraints.
- MVP queries can be derived directly from schema docs.

## Milestone 4: Security Boundaries and RLS Policy Spec
Goal
- Provide complete policy-level authorization contract before implementation.

Dependencies
- Milestone 3.

Instructions
- Expand policy specs by table in `docs/security-boundaries.md`.
- Keep trust model explicit (backend trusted, frontend untrusted).
- Add policy validation checklist in `docs/setup-guide.md`.

TODOs
- [ ] Add per-table policy intent for `projects`, `metadata_keys`, `image_metadata`.
- [ ] Add policy failure examples (expected deny cases).
- [ ] Add storage policy guidance for signed URL default.
- [ ] Add RLS verification steps for dev setup.

Acceptance criteria
- Every user/project-scoped table has policy guidance.
- Deny behavior is documented, not just allow behavior.
- Setup guide includes practical RLS verification steps.

## Milestone 5: Map and Geocoding Behavior Contract
Goal
- Make spatial UX behavior deterministic and testable.

Dependencies
- Milestone 1, Milestone 3.

Instructions
- Formalize address search and fallback behavior in `docs/architecture.md` and `docs/decisions.md`.
- Clarify cluster/result ordering and nearby semantics.
- Add UI state behavior for loading/no-results/closest-match.

TODOs
- [ ] Add exact geocoding behavior table (exact match, closest match, no match).
- [ ] Add explicit user notice text requirement for closest-match fallback.
- [ ] Add cluster click ordering contract (distance asc, timestamp desc).
- [ ] Add state handling notes for map errors and empty filters.

Acceptance criteria
- Geocoding and map response behavior is deterministic.
- Result ordering is explicitly documented and testable.
- Fallback messaging is mandatory and non-silent.

## Milestone 6: Ingestion and Marker Correction Pipeline
Goal
- Define reliable upload-to-map data flow with EXIF preservation.

Dependencies
- Milestone 3, Milestone 4.

Instructions
- Specify upload, EXIF extraction, correction, and save sequence in `docs/features.md` and `docs/use-cases.md`.
- Document failure branches (missing EXIF, parse errors, upload retries).
- Ensure ownership and storage policy ties are explicit.

TODOs
- [ ] Add end-to-end upload sequence (file -> storage -> metadata -> image row).
- [ ] Add missing-EXIF behavior and fallback coordinate flow.
- [ ] Add marker-correction persistence contract and audit note.
- [ ] Add user-facing error handling expectations.

Acceptance criteria
- Upload flow includes successful and failure branches.
- EXIF immutability rule is explicit in all relevant docs.
- Corrected coordinate behavior is consistent across feature and schema docs.

## Milestone 7: Filter and Retrieval Semantics
Goal
- Fully define filter logic for time/project/metadata/distance and pagination.

Dependencies
- Milestone 5, Milestone 6.

Instructions
- Consolidate filter semantics in `docs/features.md` and `docs/use-cases.md`.
- Add clear rules for combining filters and ordering results.
- Tie query behavior to indexing strategy in `docs/database-schema.md`.

TODOs
- [ ] Add canonical filter-combination rules (AND/OR behavior).
- [ ] Add pagination and limit defaults for viewport queries.
- [ ] Add distance filter reference-point definition and edge cases.
- [ ] Add index coverage notes for top query patterns.

Acceptance criteria
- Filter semantics are implementation-ready.
- Query behavior is performance-aware and index-backed.
- No ambiguity remains on ordering, pagination, or filter composition.

## Milestone 8: Performance and Scalability Readiness
Goal
- Establish measurable performance guardrails for MVP release.

Dependencies
- Milestone 7.

Instructions
- Convert current performance statements into measurable targets.
- Add load profile assumptions (users, images, viewport density).
- Define observability and fallback expectations.

TODOs
- [ ] Add target response time budgets for common map/filter actions.
- [ ] Add stress scenarios (dense markers, broad time ranges, metadata-heavy filters).
- [ ] Add graceful degradation rules (clustering, pagination tightening).
- [ ] Add performance validation checklist in `docs/setup-guide.md`.

Acceptance criteria
- Performance expectations are numeric, not qualitative.
- Stress cases and degradation behavior are documented.
- MVP performance gate is testable before release.

## Milestone 9: Expanded Project Use Cases
Goal
- Broaden operational coverage beyond baseline personas without breaking MVP focus.

Dependencies
- Milestone 1.

Instructions
- Add new practical use cases in `docs/use-cases.md` tied to current architecture.
- Keep future-focused flows clearly marked post-MVP.

TODOs
- [ ] Add UC6: supervisor multi-project site review.
- [ ] Add UC7: data steward metadata normalization and cleanup workflow.
- [ ] Add UC8: security audit flow for role and access verification.
- [ ] Link each new use case to features and security boundaries.

Acceptance criteria
- New use cases are concrete and role-specific.
- Each new use case has preconditions, flow, postconditions, invariants.
- MVP vs post-MVP boundaries remain explicit.

## Milestone 10: Release Governance and Change Control
Goal
- Create a repeatable release process with quality gates.

Dependencies
- Milestone 8, Milestone 9.

Instructions
- Define release gates for security, performance, and functional correctness.
- Standardize how changes are proposed across docs.
- Require traceability from change -> impacted docs -> acceptance checks.

TODOs
- [ ] Add release gate checklist section in `docs/setup-guide.md` or new release doc.
- [ ] Add "change impact" template for PR/issue descriptions.
- [ ] Add required docs-to-update list for schema/security changes.
- [ ] Add recurring review cadence for decisions and invariant drift.

Acceptance criteria
- Release criteria are explicit and reusable.
- Change requests include impact traceability.
- Decision and invariant drift is regularly reviewed.

## AI-friendly formatting conventions for this project plan
- Use stable headers (`Milestone X: Name`) so tools can parse progress.
- Keep `Goal`, `Dependencies`, `Instructions`, `TODOs`, `Acceptance criteria` in every milestone.
- Keep TODO lines as checkbox items for easy extraction.
- Keep acceptance criteria measurable and unambiguous.
- Prefer glossary terms exactly as defined in `docs/glossary.md`.
