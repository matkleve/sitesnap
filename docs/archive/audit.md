# Sitesnap Documentation Audit

**Date:** 2026-03-04  
**Scope:** Cross-document consistency and implementation-impact gaps across `docs/`  
**Goal:** Keep the deep-dive concerns, but track only actionable open items

---

## Table of Contents

- [Part A — Deep-Dive: Three Known Concerns](#part-a--deep-dive-three-known-concerns)
  - [Concern 1: Map + Image Loading Performance](#concern-1-map--image-loading-performance)
  - [Concern 2: Spatial Selection UX](#concern-2-spatial-selection-ux)
  - [Concern 3: Split-Screen Group Workspace](#concern-3-split-screen-group-workspace)
- [Part B — Open Documentation Backlog (Triaged)](#part-b--open-documentation-backlog-triaged)

---

# Part A — Deep-Dive: Three Known Concerns

---

## Concern 1: Map + Image Loading Performance

**Current risk**

- Spatial loading contracts are partially specified but still under-defined for implementation consistency.
- Clustering, pagination, and progressive image loading details are distributed across docs.

**Directional decision**

- Treat PostGIS + GiST + server-side clustering as MVP default.
- Keep retrieval contract explicit: viewport bounds, debounce, abort-previous, cursor pagination.

**Docs that must stay aligned**

- `database-schema.md`
- `architecture.md`
- `features.md`
- `decisions.md`

---

## Concern 2: Spatial Selection UX

**Current risk**

- Right-click/long-press radius selection is specified but discoverability and keyboard/accessibility details can drift.

**Directional decision**

- Keep radius selection as primary spatial gesture.
- Keep toolbar fallback and keyboard path in the same contract.

**Docs that must stay aligned**

- `features.md`
- `architecture.md`
- `use-cases.md`
- `decisions.md`

---

## Concern 3: Split-Screen Group Workspace

**Current risk**

- Group workspace behavior is documented, but state/lifecycle details can diverge between UX docs and milestone execution.

**Directional decision**

- Treat `Active Selection` + named groups as the canonical workspace model.
- Keep mobile bottom-sheet behavior explicitly tied to desktop workspace semantics.

**Docs that must stay aligned**

- `features.md`
- `architecture.md`
- `database-schema.md`
- `use-cases.md`

---

# Part B — Open Documentation Backlog (Triaged)

Status values: `Open`, `In Progress`, `Done`, `Won’t Do`  
Priority values: `P0` (blocker), `P1` (high), `P2` (polish)

## Backlog Table

| ID     | Priority | Status | Area            | Open Item                                                                                                      | Milestone   |
| ------ | -------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| DOC-01 | P0       | Open   | Performance     | Promote PostGIS+GiST to explicit MVP default in schema + architecture language.                                | M3, M5      |
| DOC-02 | P0       | Open   | Retrieval       | Define canonical viewport query contract (bounds, debounce, abort, cursor reset behavior).                     | M5, M7      |
| DOC-03 | P0       | Open   | Pagination      | Lock cursor pagination contract and max limits in one place, then cross-link.                                  | M7          |
| DOC-04 | P0       | Open   | Loading         | Define progressive image loading contract (marker-only → thumb → full).                                        | M5, M8      |
| DOC-05 | P0       | Open   | Selection       | Finalize keyboard shortcuts and fallback semantics for radius selection.                                       | M7a         |
| DOC-06 | P1       | Open   | Workspace       | Clarify `Active Selection` lifecycle versus persisted named groups.                                            | M7a         |
| DOC-07 | P1       | Open   | Security        | Add deny-case examples for RLS to complement allow-path docs.                                                  | M4          |
| DOC-08 | P1       | Open   | Security        | Add step-by-step RLS verification workflow with expected outcomes.                                             | M4          |
| DOC-09 | P1       | Open   | Lifecycle       | Add password-reset E2E expectations into lifecycle/security docs.                                              | M2          |
| DOC-10 | P1       | Open   | Filters         | Keep filter-combination semantics (AND/OR) mirrored across feature, use-case, and milestone docs.              | M7, M-IMPL5 |
| DOC-11 | P1       | Open   | Search          | Keep search behavior source-of-truth in `search-experience-spec.md`; avoid duplicating behavior in audit docs. | M-IMPL6     |
| DOC-12 | P2       | Open   | Cross-links     | Continue cross-reference cleanup between lifecycle, schema, milestones, and decisions docs.                    | M10         |
| DOC-13 | P2       | Open   | Browser support | Add explicit browser support targets and constraints (especially for folder import/search UX).                 | M9          |

---

## Working Rules

1. Keep deep-dive concerns in Part A; keep only active items in Part B.
2. Add each new audit finding as one backlog row (priority + milestone required).
3. Mark closed items as `Done` in-place instead of creating a new long historical registry.
4. Keep this file aligned with `implementation-readiness.md` and `milestones.md`.
