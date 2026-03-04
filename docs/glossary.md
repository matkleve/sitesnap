# Glossary

**Who this is for:** anyone reading or writing GeoSite code or docs.  
**What you’ll get:** precise definitions of domain terms and where they show up in the system.

---

## Core Domain Terms

- **GeoSite**  
  The overall system: geo‑temporal image management for construction documentation.

- **User**  
  An authenticated person using GeoSite.
  - Identity: Supabase `auth.users`.
  - Domain data: `profiles` table.

- **Profile**  
  Application-specific extension of a user (e.g., full name, company).
  - Table: `profiles`.
  - 1:1 with `auth.users` via primary key/foreign key.

- **Role**  
  Label describing a category of permissions (e.g., `admin`, `user`, `viewer`).
  - Tables: `roles`, `user_roles`.
  - Used in Row-Level Security (RLS) checks.

- **Technician**  
  A field user documenting construction sites with photos. Typically has role `user`.

- **Clerk**  
  An office user preparing quotes and documentation from historical images. May have role `user` or `viewer`.

- **Admin**  
  User with elevated permissions (see `security-boundaries.md`), including broader visibility and management tasks.

---

## Spatial & Temporal Concepts

- **Image**  
  A single photo plus its associated metadata in the database.
  - Table: `images`.
  - Key fields: `id`, `user_id`, `storage_path`, `latitude`, `longitude`, `geog`, `captured_at`, (optional) direction/bearing, project reference, metadata.

- **Viewport**  
  The rectangular area of the map currently visible to the user.
  - Defined by a bounding box (SW + NE corners).
  - Changes on pan, zoom, or window resize.
  - Triggers a debounced data query (see architecture.md §8).

- **Bounding Box**  
  A pair of `(lat, lng)` coordinates representing the south-west and north-east corners of a rectangular map region.
  - Used as the spatial filter for viewport queries: `ST_DWithin` or `&&` operator against the `geog` column.

- **Cluster**  
  A visual grouping of nearby markers on the map rendered as a single icon with a count badge.
  - Server-side: computed via `ST_SnapToGrid` (see architecture.md §8, decisions.md D11).
  - Client-side: only used if server-side clustering is disabled.
  - Click expands to child markers or zooms in.

- **Thumbnail**  
  A 128×128 px JPEG preview of an image, generated on upload.
  - Stored at `{org_id}/{user_id}/{uuid}_thumb.jpg` in Supabase Storage.
  - Used in gallery grids and map popups to avoid loading full-resolution images.

- **Progressive Loading**  
  A 3-tier strategy for rendering images efficiently:
  1. **Markers only** — just pins on the map (no image data transferred).
  2. **Thumbnails** — 128×128 previews loaded for visible items in the gallery or popups.
  3. **Full resolution** — loaded on demand when the user opens the detail view.

- **Radius Selection**  
  A spatial interaction: right-click + drag on desktop (long-press + drag on mobile) to draw a circle on the map.
  - All images within the circle are added to the Active Selection.
  - See decisions.md D13.

- **Location / Coordinates**  
  The latitude and longitude representing where the photo was taken or is anchored on the map.
  - Stored as numeric fields in `images`.
  - Used for all spatial queries and map rendering.

- **EXIF Coordinates**  
  The original latitude and longitude embedded in the image file’s EXIF metadata.
  - Parsed on upload (when available).
  - Must be stored in a way that is never overwritten (see invariants).

- **Corrected Coordinates**  
  Updated latitude and longitude after a user drags a marker to fix small errors.
  - Stored separately from EXIF values.
  - Used for display and spatial search once present.

- **Timestamp / Capture Time**  
  Time the image was taken (from EXIF if possible) or uploaded.
  - Used in timeline filtering and ordering of results.

- **Camera Direction / Bearing**  
  Approximate direction in which the camera was pointing when the photo was taken.
  - Used for directional relevance calculations.
  - Optional; if missing, image is treated as direction-neutral.

- **Directional Relevance**  
  Whether an image is considered relevant given a viewer’s position and facing direction.
  - Depends on distance (e.g., 50m radius) and bearing tolerance (e.g., ±30°).
- **Address Label**  
  A human-readable address string stored alongside an image's coordinates (e.g., "Burgstraße 7, 8001 Zürich").
  - Column: `images.address_label`.
  - Populated on upload from (a) a user-entered address, (b) a filename hint resolved via `AddressResolverService`, or (c) reverse geocoding of the EXIF coordinates.
  - Used by `AddressResolverService` to build the DB-first address index for autocomplete ranking.
  - See `address-resolver.md` §7.

- **Filename Hint**  
  An address or location string extracted from a folder name or filename during folder-based bulk import (e.g., `Burgstraße_7` from a folder path).
  - Extracted by `FilenameLocationParser`.
  - Treated as a primary location source because it represents deliberate human organization, not automatic sensor data.
  - See `folder-import.md` §4.1 and `decisions.md` D16.

- **Location Resolution (folder import)**  
  The per-image process during `FolderImportAdapter` that combines filename hints and EXIF GPS to produce a confirmed set of coordinates before import.
  - Outcomes: concordant (auto-import), conflict (must be resolved by user), filename-only, EXIF-only, or unresolved (manual review queue).
  - See `folder-import.md` §4.3.

- **Manual Review Queue**  
  A holding area in the folder import review UI for images that could not be automatically resolved to a location.
  - The user can enter an address, use drag-to-map placement, assign a batch location, or skip.
  - Skipped images are stored with `location_unresolved = TRUE` and do not appear on the map.
  - See `folder-import.md` §5.3.
---

## Project & Metadata

- **Organization**  
  A company or team that owns all data within its scope. Every user belongs to exactly one organization.
  - Table: `organizations`.
  - All RLS policies use `organization_id` to enforce data isolation between orgs (see security-boundaries.md §2.1, decisions.md D12).

- **Project**  
  A logical grouping of images that belong to the same construction job, site, or contract.
  - Scoped to an organization.
  - Used to filter and organize photos across time and space.

- **Group (Saved Group)**  
  A named, user-created collection of images. Represented as a tab in the workspace.
  - Table: `saved_groups` + `saved_group_images`.
  - A group can contain images from any project, location, or time range.
  - Private to the creator (future: optionally shared within the org).

- **Active Selection**  
  A transient, in-memory group that holds images currently selected on the map (via click, Ctrl+click, or radius selection).
  - Always visible as the first tab in the workspace.
  - Not persisted to the database; cleared on page reload.
  - Can be saved as a named Group.

- **Workspace**  
  The tabbed panel (desktop: side pane; mobile: bottom sheet) that displays image groups.
  - Contains the Active Selection tab plus zero or more named Group tabs.
  - See architecture.md §11, decisions.md D14.

- **Metadata Key**  
  A user-defined property name attached to an image, such as “Fang”, “Türe”, “Material”.
  - Represents a dimension along which images can be searched or filtered.

- **Metadata Value**  
  The concrete value assigned to a metadata key for a given image.
  - Example: key `Material`, value `Beton`.

---

## Security & Access

- **Row-Level Security (RLS)**  
  PostgreSQL mechanism that restricts which rows a given authenticated user can see or modify.
  - Enforces ownership, role-based, and organization-scoped access in tables such as `images`.

- **JWT (JSON Web Token)**  
  Token issued by Supabase upon login.
  - Used by the frontend to authenticate requests.
  - Interpreted by PostgreSQL RLS and Supabase to apply policies.

- **Signed URL**  
  A time-limited URL generated by Supabase Storage that grants read access to a private file.
  - Default TTL: 1 hour.
  - The frontend never constructs storage paths directly; it always requests a signed URL.

- **Storage Path**  
  The relative path to an image file within Supabase Storage.
  - Format: `{org_id}/{user_id}/{uuid}.jpg`.
  - Stored in `images.storage_path` — not a full URL. URLs are generated at runtime via signed-URL APIs.

---

## Technical / Infrastructure

- **PostGIS**  
  PostgreSQL extension providing spatial data types (`geography`), operators (`<->`, `&&`), and functions (`ST_DWithin`, `ST_SnapToGrid`).
  - Enabled by `CREATE EXTENSION postgis;` in the Supabase SQL editor.
  - See decisions.md D11.

- **GiST Index**  
  Generalized Search Tree index used by PostGIS for efficient spatial queries.
  - Applied to `images.geog` for bounding-box and distance queries.

- **MapAdapter**  
  An abstraction layer over the map library (Leaflet).
  - Defined in architecture.md §6.
  - Ensures the Angular application never calls Leaflet APIs directly, making it swappable.

- **AddressResolverService**  
  An Angular service (`providedIn: 'root'`) that resolves address queries to a ranked list of geographic candidates.
  - Queries the GeoSite database first (DB-first ranking), then calls `GeocodingAdapter` for external results.
  - Returns results as `AddressCandidateGroup`: `databaseCandidates` first (up to 3), then `geocoderCandidates` (up to 5), separated by a visual divider.
  - Used at every address-input point in the application: map search bar, upload panel, folder import review, marker correction.
  - See `address-resolver.md` and `decisions.md` D17.

- **FolderImportAdapter**  
  An `ImageInputAdapter` implementation that wraps the browser File System Access API (`showDirectoryPicker()`).
  - Recursively scans a user-selected folder for images and feeds them into the core ingestion pipeline.
  - Requires a Chromium-based browser (Chrome 86+, Edge 86+).
  - See `folder-import.md` and `decisions.md` D10, D16.

- **FilenameLocationParser**  
  A pure utility function (no Angular DI dependencies) that extracts address hints from file paths and filenames.
  - Applied during the folder import resolution phase.
  - Normalises German street name variants (`str.` → `Straße`, `Strasse` → `Straße`).
  - See `folder-import.md` §4.1.

- **pg_trgm**  
  PostgreSQL extension providing trigram-based string similarity functions (`similarity()`, `word_similarity()`).
  - Used by `AddressResolverService`'s database query for fuzzy address matching.
  - Enabled via `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.
  - Fallback: `LIKE '%query%'` is used when `pg_trgm` is unavailable.

---

## Usage Notes

- Prefer these terms in code, UI, and docs to avoid ambiguity.
- When introducing a new domain concept, add it here and link to the relevant table or module.
