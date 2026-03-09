# Implementation Readiness Index

**Who this is for:** engineers deciding what to build next and reviewers validating coverage.  
**What you'll get:** a single-page view of every feature group and use case, scored by implementation maturity, with links to canonical specs.

**Last reviewed:** 2026-03-04

> This file is the **only** place readiness scores are tracked.  
> Specs live in `features.md`, `use-cases/README.md`, `architecture.md`, etc.  
> Milestone-level delivery tracking lives in `milestones.md`.

---

## How to Read This Document

| Column        | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| **Score**     | Implementation maturity on a 0–20 scale (0 = not started, 20 = production-ready). |
| **Band**      | Now (≤ 8, urgent), Next (9–14, plan soon), Later (15–19, polish), Done (20).      |
| **Impl refs** | Milestone IDs from `milestones.md` that deliver this work.                        |
| **Spec refs** | Canonical doc sections that define the requirement.                               |

Scores reflect **code that exists and passes tests today**, not how well the spec is written.

---

## 1. Feature Group Readiness

| #   | Feature Group                         | Feature IDs | Score  | Band  | Key Gaps                                                                                                                                                                                                                      | Impl Refs                | Spec Refs                                                               |
| --- | ------------------------------------- | ----------- | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------- |
| 1   | Authentication & User Management      | 1–3, 37     | **16** | Later | Password-reset E2E test, account deletion cascade UI                                                                                                                                                                          | M-IMPL2 ✅, M-UI9        | `features.md` §1.1, `user-lifecycle.md`                                 |
| 2   | Image Ingestion (core pipeline)       | 4–8         | **14** | Next  | `ImageInputAdapter` interface not extracted, no provider DI registration, marker correction UI absent                                                                                                                         | M-IMPL4 ✅, M-IMPL4a ✅  | `features.md` §1.2, `architecture.md` §5                                |
| 3   | Upload Validation & Feedback          | 30–33       | **11** | Next  | Dimension checks (100×100 min, 8192×8192 max) missing, HEIC→JPEG conversion missing, client-side compression >4096 px missing                                                                                                 | M-IMPL4b ✅ (partial)    | `features.md` §1.9                                                      |
| 4   | Spatial & Temporal Exploration        | 9–15        | **7**  | Now   | No viewport-bounded fetch, no server-side clustering, no cursor pagination, no detail view, no timeline filter                                                                                                                | M-IMPL5 🔲               | `features.md` §1.3, `architecture.md` §8                                |
| 5   | Map Retrieval Pipeline                | 12–13       | **4**  | Now   | No PostGIS viewport query wiring, no `ST_SnapToGrid` clustering, no debounce+abort in data layer                                                                                                                              | M-IMPL5 🔲               | `archive/audit.md` Concern 1, `architecture.md` §8                      |
| 6   | Search Experience & DB-First Resolver | 10, 44      | **6**  | Now   | Search is geocoder-only; no DB-first candidates, no `AddressResolverService`, no autocomplete cache, clear (×) button missing in committed state, recent-search MRU persistence not wired, dropdown DB section is placeholder | M-IMPL6 🔲               | `search-experience-spec.md`, `address-resolver.md`, `features.md` §1.15 |
| 7   | Project & Metadata System             | 16–18       | **3**  | Now   | No `ProjectService`, no metadata-key CRUD, no autocomplete, no filter by project/metadata, no batch assignment UI                                                                                                             | M-IMPL5 🔲 (partial)     | `features.md` §1.4, `database-schema.md`                                |
| 8   | Distance & Spatial Selection          | 19–20       | **5**  | Now   | No radius selection (right-click drag / long-press), no `ST_DWithin` query, no Active Selection tab population, no distance presets                                                                                           | M-IMPL5 🔲               | `features.md` §1.5, `archive/audit.md` Concern 2                        |
| 9   | Filter Semantics                      | 28–29       | **4**  | Now   | No filter combination engine (AND across categories, OR within), no `localStorage` filter persistence, no viewport persistence                                                                                                | M-IMPL5 🔲               | `features.md` §1.8                                                      |
| 10  | Group-Based Workspace                 | 24–27       | **2**  | Now   | Groups page is placeholder, no Active Selection tab, no "Save as Group" flow, no group CRUD service, no image deletion flow                                                                                                   | M-UI7, M-UI4             | `features.md` §1.7, `archive/audit.md` Concern 3                        |
| 11  | Security & Performance                | 21–23       | **12** | Next  | RLS policies exist in migrations but deny-case tests missing, viewer role UI restrictions not enforced, signed-URL refresh logic absent                                                                                       | M-IMPL1 ✅ (schema)      | `features.md` §1.6, `security-boundaries.md`                            |
| 12  | Detail View & Correction History      | 15          | **4**  | Now   | No detail view component, no "Reset to EXIF" button, no correction history display, no marker drag-to-correct                                                                                                                 | M-UI4                    | `features.md` §1.3 F15, `use-cases/README.md` UC10                      |
| 13  | Responsive Layout                     | 34–36       | **8**  | Now   | Nav adapts (desktop pill + mobile bar), but workspace bottom-sheet (mobile), tablet slide-over, and image detail as full-screen overlay are missing                                                                           | M-UI3 ✅ (partial)       | `features.md` §1.10                                                     |
| 14  | UI & Theming                          | 38–40       | **10** | Next  | Design tokens exist, Tailwind configured, but dark-mode variants incomplete (upload panel, placement banner, photo panel have hardcoded colors), `ThemeService` not implemented                                               | M-UI1 ✅ (tokens), M-UI8 | `features.md` §1.13                                                     |
| 15  | Admin / Role Management UX            | (UC4)       | **3**  | Now   | No in-app user management view, no role toggle UI, admin actions require Supabase dashboard or SQL console                                                                                                                    | — (no milestone yet)     | `use-cases/README.md` UC4, `security-boundaries.md`                     |
| 16  | Folder-Based Bulk Import              | 41–43       | **1**  | Later | `FolderImportAdapter` not created, `FilenameLocationParser` not created, review queue not created, import summary not created                                                                                                 | — (no milestone yet)     | `features.md` §1.14, `folder-import.md`                                 |
| 17  | Smart Address Resolution              | 44          | **1**  | Later | `AddressResolverService` not created, no `address_label` column, no DB-first ranking, no trigram index                                                                                                                        | — (no milestone yet)     | `features.md` §1.15, `address-resolver.md`                              |
| 18  | Photos Page                           | —           | **2**  | Now   | Placeholder component only; no gallery grid, no sort, no thumbnail loading, no infinite scroll                                                                                                                                | M-UI6                    | `milestones.md` M-UI6                                                   |
| 19  | Settings Page                         | —           | **2**  | Now   | Placeholder component only; no theme toggle, no map tile preference                                                                                                                                                           | M-UI8                    | `milestones.md` M-UI8                                                   |
| 20  | Account Page                          | —           | **2**  | Now   | Placeholder component only; no change-password, no change-email, no delete-account                                                                                                                                            | M-UI9                    | `milestones.md` M-UI9                                                   |

---

## 2. Use-Case Readiness

| UC   | Name                              | MVP? | Score  | Band  | Blocking Gaps                                                                                      | Feature Deps      |
| ---- | --------------------------------- | ---- | ------ | ----- | -------------------------------------------------------------------------------------------------- | ----------------- |
| UC1  | Technician on Site (View History) | Yes  | **6**  | Now   | Viewport-bounded loading, distance filter, radius selection, detail view, Active Selection tab     | 9–15, 19–20, 24   |
| UC2  | Clerk Preparing a Quote           | Yes  | **5**  | Now   | Project filter, metadata filter, groups, Named Group tabs, detail view                             | 9–18, 24–26       |
| UC3  | Upload and Correct a New Image    | Yes  | **12** | Next  | HEIC conversion, dimension validation, compression, marker correction post-save                    | 4–8, 30–33        |
| UC4  | Admin Managing Roles              | Yes  | **4**  | Now   | No admin UI; only SQL/dashboard                                                                    | 21, admin UX      |
| UC5  | Right-Click Marker Creation       | No   | **0**  | Later | Post-MVP. Not started.                                                                             | —                 |
| UC6  | Resume After Connectivity Loss    | No   | **3**  | Later | No offline queue, no auto-retry on reconnect                                                       | 30–31             |
| UC7  | Batch Upload After Site Visit     | No   | **9**  | Next  | Concurrency works, but batch summary, bulk project/metadata assign, pre-upload map preview missing | 4–8, 16–18, 30–33 |
| UC8  | Viewer Reviewing Site             | No   | **4**  | Now   | Viewer role UI restrictions not enforced, groups not functional                                    | 21, 24–26         |
| UC9  | Multi-Site Quote Grouping         | No   | **3**  | Now   | Group accumulation workflow not built                                                              | 19–20, 24–26      |
| UC10 | Post-Save Marker Correction       | No   | **4**  | Now   | No correction editor, no drag-to-correct, no correction history surface                            | 8, 15             |
| UC11 | Admin Offboarding                 | No   | **3**  | Later | No admin offboarding UI, no image ownership transfer                                               | 21, admin UX      |
| UC12 | Audit Trail Investigation         | No   | **5**  | Now   | No correction-history UI, no uploader identity in detail view                                      | 15, 21            |
| UC13 | Bulk Folder Import                | No   | **1**  | Later | `FolderImportAdapter`, `AddressResolverService`, review queue all absent                           | 41–44             |

---

## 3. Top 10 Gaps (Priority Order)

These are the highest-leverage items to close for MVP. Order reflects dependency chains and user impact.

| Priority | Gap                                                                    | Why It Matters                                                                    | Unblocks                   |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------- |
| **P0**   | Viewport-bounded image loading + PostGIS clustering                    | Without this, the map is empty after login — nothing loads. Core data pipeline.   | UC1, UC2, F12–13           |
| **P1**   | Detail view component (image, metadata, correction history)            | Users can't inspect any image. Half the app's value is locked behind this.        | UC1, UC2, UC10, UC12, F15  |
| **P2**   | Filter engine (time, project, metadata, distance — AND/OR semantics)   | Exploration is impossible without filters. Blocks every retrieval use case.       | UC1, UC2, UC7, F28–29      |
| **P3**   | Project & metadata CRUD + filter UI                                    | Clerks cannot scope to relevant projects; technicians cannot tag uploads.         | UC2, UC3, UC7, F16–18      |
| **P4**   | Group workspace (Active Selection + Named Groups)                      | No way to collect, save, or review sets of images — core workspace pattern.       | UC1, UC2, UC8, UC9, F24–26 |
| **P5**   | Radius / spatial selection                                             | Primary discovery gesture for on-site technicians.                                | UC1, UC2, F19–20           |
| **P6**   | Upload compliance (HEIC conversion, dimension validation, compression) | Spec gap: HEIC files accepted but not viewable; oversized images waste bandwidth. | UC3, UC7, F30–33           |
| **P7**   | Dark-mode completion + `ThemeService`                                  | Shipping without dark mode is defined as a defect in `features.md` §1.13.         | F38–40                     |
| **P8**   | Photos / Groups / Settings / Account pages                             | Four placeholder pages with zero functionality.                                   | M-UI6–9                    |
| **P9**   | Admin role management UI                                               | Admins currently need the Supabase dashboard for every role change.               | UC4, UC11                  |

---

## 4. How to Update This Document

1. **After completing a milestone or feature:** update the Score column and move the Band if it changes.
2. **After adding a new feature or use case:** add a row to the relevant table and assign an initial score.
3. **Top 10 Gaps:** re-rank after each milestone completion. Remove closed gaps; promote the next highest.
4. **Review cadence:** revisit this document at the start of every implementation milestone.

---

## 5. Cross-References

| Document                                  | What it covers                               | Relationship to this file                                 |
| ----------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| `features.md`                             | Canonical feature specs (numbered 1–44)      | Defines _what_; this file tracks _how far along_          |
| `use-cases/README.md`                     | User narratives (UC1–UC13) with personas     | Defines _why_; this file tracks readiness per UC          |
| `milestones.md`                           | Delivery milestones (M1–M10, M-IMPL, M-UI)   | Defines _when_; this file scores current state            |
| `architecture.md`                         | System design, adapter interfaces, data flow | Defines _how_; gaps here map to missing adapters/services |
| `archive/audit.md`                        | Triaged documentation audit backlog          | Issue-level detail; this file aggregates into scores      |
| `archive/audit-ui-design-interactions.md` | Triaged UI/UX audit backlog                  | Issue-level detail for UI; feeds scores here              |
| `archive/audit-upload-map-interaction.md` | Triaged upload/map audit backlog             | Issue-level detail for upload; feeds scores here          |
| `security-boundaries.md`                  | RLS policies, role model, storage rules      | Security readiness feeds row 11 and row 15                |
| `address-resolver.md`                     | `AddressResolverService` contract            | Spec for row 17                                           |
| `folder-import.md`                        | `FolderImportAdapter` contract               | Spec for row 16                                           |
| `search-experience-spec.md`               | Search UX, ranking, requirements             | Spec for row 6                                            |
