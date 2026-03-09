# GeoSite - Spatial Construction Image Intelligence

**Who this is for:** frontend and backend engineers implementing GeoSite.  
**What you'll get:** a clear picture of the problem, product vision, key use cases, invariants, and MVP scope.

---

## 1. Context and Problem

Construction companies already collect thousands of photos, but retrieval often depends on nested folder structures such as:

- `/country/zip-code/address`
- `/country/zip-code/street`

This approach fails for spatial search, temporal exploration, and cross-project retrieval.

---

## 2. Product Vision

GeoSite is a geo-temporal image management system for construction companies.

Users should be able to stand at a location (or choose one on a map) and quickly find relevant historical images using:

- Coordinates
- Time range
- Project
- Metadata

All critical security and integrity enforcement must live in the backend (Supabase + PostgreSQL RLS), not in the frontend.

---

## 3. Key Use Cases (At a Glance)

Detailed flows are in `use-cases/README.md`.

- **UC1 - Technician on site (history view)**: find nearby images ordered by proximity and recency.
- **UC2 - Clerk preparing a quote**: filter by address, time, project, metadata, and distance.
- **UC3 - Marker correction**: correct photo position while preserving original EXIF coordinates.
- **UC4 - Admin role management**: grant/revoke elevated access.
- **UC13 - Folder-based bulk import**: select a local folder; GeoSite resolves locations from folder names and filenames, surfaces conflicts, and imports the batch after a review step.

---

## 4. Domain Model at a Glance

Full details are in `database-schema.md` and `glossary.md`.

- **User**: `auth.users` + `profiles`
- **Role**: `roles`, `user_roles`
- **Project**: `projects`
- **Image**: `images` with EXIF and corrected coordinates
- **Metadata**: `metadata_keys`, `image_metadata`

---

## 5. Core Invariants

- **I1 - Every image is owned and scoped**  
  Each image belongs to exactly one user (`user_id`) and may be associated with one project (`project_id`).

- **I2 - Every stored image has spatial and temporal context**  
  Effective `latitude`/`longitude` are always present for images visible on the map. Temporal context is represented by `captured_at` when available, otherwise `created_at`.
  _Exception:_ Images imported via `FolderImportAdapter` that were skipped during the review phase may be stored without coordinates (`location_unresolved = TRUE`). These images do not appear on the map and are excluded from all viewport queries until their location is provided.

- **I3 - Marker correction is additive, not destructive**  
  Corrected coordinates are stored separately. Original EXIF coordinates are never overwritten.

- **I4 - Performance guardrail**  
  The system must never load all images at once. Map views use viewport-limited, server-side filtering.

- **I5 - Frontend is untrusted for security**  
  Angular/Leaflet never enforce permissions. Authorization is done by PostgreSQL RLS.

---

## 6. MVP Scope - Features

The full and evolving capability list is maintained in `features.md`. Non-negotiable MVP capabilities include:

- Supabase email/password authentication
- EXIF extraction on upload (coordinates, timestamp, direction when available)
- Map-first UI with address search and filter panel
- Marker clustering and viewport-based lazy loading
- Time/project/metadata/distance filters
- Marker correction with EXIF preservation
- RLS-based authorization

Geocoding behavior and boundary contract are defined in `architecture.md` and referenced by `decisions.md` (D6).

---

## 7. MVP Contract

MVP release is explicitly scoped to:

- Use cases UC1-UC4 in `use-cases/README.md`.
- The MVP feature groups in `features.md` section 1.
- Core invariants I1-I5 in this document.

MVP release explicitly excludes:

- UC5 (right-click marker creation), which is post-MVP/experimental.
- All items listed in section 9 (Non-Goals).

Any change that adds scope beyond this contract must:

- Be documented in `features.md` and `use-cases/README.md`.
- Be checked against invariants I1-I5.
- Add or update a decision in `decisions.md` if invariants/data shape/dependencies are affected.

---

## 8. Performance and Scalability Requirements

Target support:

- Thousands of users
- Tens of thousands of images (and beyond with indexing improvements)

Guidelines:

- Spatial queries are server-side and viewport-bounded.
- Filters are executed server-side.
- Thumbnails are used for overview; full images are loaded on demand.

See `database-schema.md` for indexing strategy.

---

## 9. Non-Goals (MVP)

Out of scope for the first version:

- Advanced image editing
- Public/social sharing
- Complex hierarchical permission models
- Before/after overlays
- Heatmaps and analytics
- Offline mode
- Directional relevance
- Right-click map actions (upload/create marker here)

---

## 10. Technical Stack (High Level)

- **Frontend:** Angular SPA
- **Backend / BaaS:** Supabase (Auth, PostgreSQL, Storage)
- **Map:** Leaflet with OpenStreetMap tiles
- **Authorization:** PostgreSQL Row-Level Security (RLS)

---

## 11. Success Criteria

GeoSite is successful for MVP when:

- A technician can quickly see relevant nearby historical images on site.
- A clerk can prepare quotes using project/time/metadata filters without folder guessing.
- Map interactions remain responsive under realistic load.
- Access control is consistently enforced in the database via RLS.
