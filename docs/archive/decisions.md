# Decisions (ADR‑Lite)

**Who this is for:** engineers and architects modifying Sitesnap.  
**What you’ll get:** a concise record of key technical decisions, so you know what can (and cannot) be changed lightly.

---

### Decision Dependency Map

```mermaid
flowchart TD
    D1[\"D1 Supabase\\n(Auth+DB+Storage)\"] --> D2[\"D2 DB-First Security\\n(RLS)\"]
    D1 --> D11[\"D11 PostGIS\\nSpatial Index\"]
    D1 --> D15[\"D15 Progressive\\nImage Loading\"]

    D2 --> D12[\"D12 Organization-Scoped\\nVisibility\"]

    D3[\"D3 Map-First Nav\\n(Leaflet+OSM)\"] --> D8[\"D8 MapAdapter\\nSwappable\"]
    D3 --> D13[\"D13 Right-Click\\nRadius Selection\"]
    D3 --> D7[\"D7 Filter Set\\n& Cluster Ordering\"]

    D4[\"D4 EXIF vs Corrected\\nCoords Separate\"] --> D16[\"D16 Filename-First\\nLocation Resolution\"]

    D6[\"D6 Provider-Agnostic\\nGeocoding\"] --> D17[\"D17 DB-First Address\\nRanking\"]

    D8 --> D9[\"D9 Tailwind CSS\\n+ Dark Mode\"]

    D10[\"D10 Provider-Agnostic\\nImage Input\"] --> D16
    D10 --> D15

    D11 --> D7

    D12 --> D2

    D13 --> D14[\"D14 Group-Based\\nTabbed Workspace\"]

    D5[\"D5 MVP Scope\\nNarrow by Design\"]

    style D1 fill:#2563eb,color:#fff
    style D2 fill:#dc2626,color:#fff
    style D3 fill:#16a34a,color:#fff
    style D12 fill:#dc2626,color:#fff
    style D17 fill:#7c3aed,color:#fff
```

---

## Format

Each decision has:

- **Context** – why this was a problem.
- **Decision** – what we chose and any hard constraints.
- **Consequences** – what this enables, and what trade-offs we accept.

This is intentionally light-weight; if a decision would significantly affect invariants or data shape, it must be recorded here.

---

## D1 – Supabase as Backend (Auth + DB + Storage)

**Context**  
We need authentication, a managed PostgreSQL instance with Row-Level Security, and object storage for images. Operating and securing all of this manually would add significant ops overhead.

**Decision**  
Use Supabase as the Backend-as-a-Service provider:

- Supabase Auth for user registration, login, and JWT management.
- Supabase PostgreSQL for all relational data, with RLS for authorization.
- Supabase Storage for image files.

**Consequences**

- We align strongly with Supabase’s mental model (especially RLS and policies).
- We accept Supabase’s limits and update cadence.
- We avoid running our own auth or file storage stack for MVP.

---

## D2 – Database‑First Security (RLS)

**Context**  
The app handles potentially sensitive construction documentation. We must avoid duplicating permission logic in multiple places and ensure that unauthorized users cannot access data, even if the frontend is compromised.

**Decision**  
All authorization is enforced in the database using Row-Level Security policies:

- The frontend (Angular) is treated as untrusted.
- RLS policies use the current `auth.uid()` and roles in `user_roles` / `roles`.

**Consequences**

- All access control logic must be validated and tested at the SQL/RLS level.
- Any new table that contains user- or project-bound data must ship with RLS policies.
- Frontend role checks are allowed only as UX optimizations, never as security guarantees.

See `security-boundaries.md` for policy details.

---

## D3 – Map‑First Navigation (Leaflet + OpenStreetMap)

**Context**  
Core user journeys revolve around “what happened here, and when?”. Folders and pure lists are poor at answering spatial questions.

**Decision**  
Use a map as the primary navigation interface:

- Leaflet for interactive map rendering.
- OpenStreetMap tiles for base map imagery.

**Consequences**

- All key features must work from a map-centric starting point (panning, zooming, clicking markers).
- We accept some dependency on external tile servers; if necessary, we can swap providers later.
- We must optimize for bounding-box queries and clustering to keep map performance acceptable.

---

## D4 – Keep EXIF vs Corrected Coordinates Separate

**Context**  
EXIF coordinates can be off by several meters. Users need to correct markers, but we also need to keep the original sensor data for audits and debugging.

**Decision**  
EXIF coordinates and user-corrected coordinates are stored separately:

- EXIF coordinates are immutable and never overwritten.
- Corrected coordinates, if present, are the default for map display and spatial queries.

**Consequences**

- The schema must support both sets of coordinates.
- Any code performing spatial queries must define which coordinates it uses (typically corrected, with fallback to EXIF).
- We can always reconstruct and understand why an image appears at a given place on the map.

---

## D5 – MVP Scope is Narrow by Design

**Context**  
The domain invites many tempting features (annotations, analytics, before/after comparisons, complex permissions). Shipping nothing because scope is too big is a real risk.

**Decision**  
We intentionally restrict the MVP to:

- Core upload and retrieval flows for technicians and clerks.
- Map + timeline navigation.
- Project grouping and flexible metadata.
- RLS-based security and basic roles.

Non-goals are listed in `project-description.md` and must be treated as such.

**Consequences**

- We say “no” to advanced editing, offline, and analytics in early iterations.
- Architecture should make these future features _possible_ but not _required_.
- Success is measured against the MVP success criteria, not long-term vision promises.

---

## D6 – Provider‑Agnostic Geocoding Boundary

**Context**  
Sitesnap needs address search with autocomplete on the main map, but we do not want to couple the domain model to a specific geocoding vendor.

**Decision**  
Treat geocoding as a **provider‑agnostic service boundary**:

- Architecture defines a geocoding interface that takes an address string and returns candidate coordinates and address metadata.
- The default implementation uses an OpenStreetMap/Nominatim‑style provider, but this can be swapped.
- The domain model and database schema remain free of provider‑specific concepts.

**Consequences**

- Switching geocoding providers affects only the adapter layer, not the rest of the system.
- Tests and docs should refer to “geocoding service” rather than a concrete vendor name, except in stack/ops discussions.
- Behavioural contract for search is stable (exact vs closest match, explicit notice) regardless of provider.

---

## D7 – MVP Filter Set and Cluster Ordering

**Context**  
Many potential filters (direction, materials, roles, etc.) and ordering schemes exist. MVP needs a simple, deterministic rule set that engineers can implement and test against.

**Decision**  
For MVP:

- Filters:
  - Time range.
  - Project.
  - Metadata key/value.
  - Max distance (based on effective display coordinates: corrected, else EXIF).
- Cluster / result ordering:
  - When clicking a cluster or reference point, “nearby” images are ordered by:
    1. Distance to the reference point (ascending).
    2. Then timestamp (newest first).
  - “Further away” sections may group images into distance buckets beyond the primary radius.

**Consequences**

- Engineers have a clear, testable contract for filter parameters and sorting order.
- Direction data (GPSImgDirection) is now extracted during EXIF parsing and persisted in the `direction` column. Direction cone visualization and editing will be exposed in the MVP UI as part of the marker interaction layer. See `archive/audit-upload-map-interaction.md` Pattern 2.
- UI implementations should treat this ordering as part of the product behaviour, not as an incidental choice.

---

## D8 – Map Rendering as a Swappable Adapter

**Context**  
Sitesnap's map is a core UI surface. Leaflet + OpenStreetMap is a solid default, but tile providers, licensing constraints, and feature requirements can change. Coupling Angular components directly to Leaflet would make a future swap expensive and risky.

**Decision**  
Abstract map rendering behind a `MapAdapter` interface:

- Angular components interact only with `MapAdapter` (injected via Angular DI token).
- Default implementation: `LeafletOSMAdapter` (Leaflet + OpenStreetMap tiles).
- Tile-provider-specific config (URLs, API keys, attribution) lives entirely inside the adapter.
- `MapAdapter` exposes a `setTileStyle('light' | 'dark')` method so the theming layer can request dark tiles without knowing the provider.

**Consequences**

- Swapping the map provider requires only replacing the adapter and updating the DI registration. No component changes.
- Leaflet is the default and there is no active plan to change it; the boundary prevents lock-in, not churn.
- The interface must not expose Leaflet-specific types in its public contract (e.g., `L.LatLng`). Use plain `{ lat, lng }` objects.

See `architecture.md` sections 3 and 6.

---

## D9 – Tailwind CSS as Styling Framework with First-Class Dark Mode

**Context**  
Sitesnap is a field-facing tool used in varied lighting conditions. Dark mode is a real ergonomic requirement for technicians working at night or in low-light environments, not a cosmetic option. Without a deliberate theming architecture, dark mode tends to be bolted on late and incompletely.

Tailwind was specifically chosen for its utility-first approach, strong theme support, first-class dark mode support via the class strategy, and strong compatibility with AI-assisted development workflows where utilities are unambiguous and self-documenting.

**Decision**  
Use Tailwind CSS as the sole styling foundation with first-class dark mode support:

- Utility-first: all styling is expressed as Tailwind utility classes or design-token-mapped utilities.
- Configure Tailwind with `darkMode: ['class', '[data-theme="dark"]']` — activates `dark:` utilities when a `[data-theme="dark"]` attribute is present on an ancestor (mirrors the CSS custom property toggle).
- Manage `[data-theme="dark"]` on `<html>` via an Angular `ThemeService` that persists preference to `localStorage`.
- Define all brand colors, surfaces, border radii, spacing, and text tokens in `tailwind.config.js` as the canonical source of truth, referencing CSS custom properties so runtime overrides remain possible.
- Every component ships with both light and `dark:` variants. Shipping without dark mode is a defect.
- Arbitrary CSS values (e.g., `w-[37px]`) are only permitted when no token covers the use case. Otherwise every value must map to a defined token.
- All interactive elements (buttons, chips, pills, tags, icon buttons, filters) must have a minimum hit area of ~38px. Use `min-h-tap` / `min-w-tap` tokens or padding / `::before` pseudo-elements to meet this without changing the visual size.

**Consequences**

- Tailwind's JIT compiler keeps the CSS bundle small regardless of token count.
- No CSS-in-JS or separate theming library is needed.
- The CSS custom property contract is the stable surface for theming; component classes change freely as long as the tokens are honored.
- Designers and engineers must coordinate on the token set defined in `tailwind.config.js`; ad-hoc color or size usage is prohibited.
- Dark mode is treated as a first-class concern from the beginning, not a post-MVP enhancement.

See `architecture.md` section 7 and `tailwind.config.js`.

---

## D10 – Provider-Agnostic Image Input Layer

**Context**  
MVP requires local device upload. Google Drive import is a high-priority near-term request. Without an abstraction, adding Google Drive (or any future source) would require modifying the ingestion pipeline — the most sensitive part of the write path.

**Decision**  
Abstract all image input sources behind an `ImageInputAdapter` interface:

- The core ingestion pipeline (EXIF parse → Supabase Storage upload → DB record write) depends only on `ImageInputAdapter`, never on a concrete adapter.
- Default implementation: `LocalUploadAdapter` (browser `<input type="file">`).
- Post-MVP: `GoogleDriveAdapter` (Drive Picker API) is a drop-in replacement or parallel option.
- Adding new sources requires implementing the interface and registering in DI. Zero changes to ingestion logic.

**Consequences**

- The ingestion pipeline is testable in isolation with a mock adapter.
- Google Drive and future sources are genuinely isolated from the upload UI and core logic.
- The adapter interface must stay narrow; source-specific metadata (e.g., Drive file ID) goes into `ImageInputMetadata`'s open extension field, not into the interface contract.
- MVP ships with only `LocalUploadAdapter`; `GoogleDriveAdapter` is not a gate for MVP release.

See `architecture.md` section 5.

---

## D11 – PostGIS as MVP Spatial Index

**Context**  
The original indexing strategy uses a composite btree on `(latitude, longitude)`. Btree indexes are one-dimensional: they efficiently range-scan the first column but filter the second column sequentially. For bounding-box viewport queries (`WHERE lat BETWEEN x1 AND x2 AND lng BETWEEN y1 AND y2`), this degrades to a partial table scan at scale. Additionally, distance-based queries (`ST_DWithin`) and server-side spatial clustering are impossible without a true spatial index.

**Decision**  
Use PostGIS with a `geography(Point, 4326)` column and GiST index as the **MVP default**, not an optional enhancement:

- Add a `geog` column to `images`, maintained by a trigger on `latitude`/`longitude` changes.
- Create a GiST index on `geog`.
- All viewport queries use the `&&` (bounding box intersection) operator against `geog`.
- Distance queries use `ST_DWithin` and the `<->` nearest-neighbor operator.
- Server-side clustering uses `ST_SnapToGrid` grouped by zoom-level-appropriate grid sizes.

Supabase supports PostGIS via `CREATE EXTENSION postgis`.

**Consequences**

- Viewport and distance queries are orders of magnitude faster than btree at scale.
- Server-side clustering becomes possible, keeping mobile clients thin.
- Schema migration is required (add `geog` column, backfill, create GiST index).
- Engineers must learn basic PostGIS functions (`ST_DWithin`, `ST_MakePoint`, `ST_SnapToGrid`).
- The btree indexes on `latitude`/`longitude` are removed. Effective coordinates are still stored as numeric columns for readability and non-spatial queries.

See `database-schema.md` §9 and `architecture.md` §8.

---

## D12 – Organization-Scoped Data Visibility

**Context**  
The original RLS model restricts image visibility to the image owner (`user_id = auth.uid()`) or admins. This makes the Clerk use case (UC2) impossible: a Clerk cannot see images uploaded by a Technician even though they work for the same company. The `profiles.company` column was free text, unsuitable for relational scoping.

**Decision**  
Introduce an `organizations` table and scope all data visibility by organization membership:

- Each user belongs to exactly one organization via `profiles.organization_id`.
- Images, projects, and metadata keys are scoped to the user's organization.
- RLS policies for `images`, `projects`, and `metadata_keys` check that the requesting user's `organization_id` matches the row's `organization_id`.
- `images.organization_id` is denormalized (copied from the user's profile on insert) to avoid a join on every RLS check.

**Consequences**

- All users in the same organization can see all images and projects within that organization. No per-project access control for MVP.
- The `profiles.company` free-text column is replaced by `profiles.organization_id`.
- Organization creation and user-to-org assignment are admin operations (Supabase dashboard or admin UI in future).
- Multi-tenant isolation is built in from day one.
- Per-project access control (e.g., `project_members` table) can be layered on post-MVP without breaking the org model.

See `database-schema.md` §2–§3 and `security-boundaries.md`.

---

## D13 – Right-Click Drag Radius Selection

**Context**  
Users need to select all images within a geographic area for review, grouping, or export. The natural gesture is click-and-drag to draw a selection radius. However, left-click drag is universally mapped to map panning, creating an irreconcilable UX conflict.

**Decision**  
Use **right-click + drag** as the primary desktop gesture for radius selection:

- Right-click drag has no default behaviour in Leaflet, Google Maps, or Mapbox — it's an unoccupied gesture slot.
- The browser's `contextmenu` event is suppressed on the map canvas.
- On mobile, **long-press + drag** is the equivalent gesture (≥500ms press activates selection mode).
- A toolbar button (crosshair icon, keyboard shortcut `S`) provides a secondary entry point for discoverability and accessibility.
- On completion, selected images populate the **Active Selection** tab in the workspace pane.

**Consequences**

- No conflict with pan or zoom gestures.
- Right-click context menus are not available on the map (acceptable; no map-level context menu is planned for MVP).
- The `contextmenu` event suppression is map-scoped only; right-click works normally elsewhere in the UI.
- First-use discoverability requires a tooltip or onboarding hint.
- The `MapAdapter` interface is extended with `enableRadiusSelection()`, `onRadiusSelect()`, `onRadiusChange()`, and `onRadiusClear()` methods.

See `architecture.md` §12 and `features.md`.

---

## D14 – Group-Based Tabbed Workspace

**Context**  
Users need a way to organize and review selected images while maintaining map context. The initial proposal was a split-screen layout with tabs. The key clarification: a tab represents a **named group of images** (not a single image), and a persistent **Active Selection** tab reflects the current map selection.

**Decision**  
Implement a **group-based tabbed workspace pane** on the right side of the map:

- **Active Selection tab** (always present, ephemeral): shows images from the current radius selection or marker interaction. Not persisted.
- **Named group tabs** (user-created, persistent): the user creates a group from a selection, gives it a name, and it becomes a tab. Each group can contain any number of images. Groups are persisted to the database (`saved_groups`, `saved_group_images`).
- On desktop: the workspace pane is a collapsible side panel with resizable width.
- On mobile: the workspace is a bottom sheet with a chip bar for tab switching.
- Only the active tab's thumbnail grid is rendered in the DOM. Inactive tabs hold metadata only.

**Consequences**

- Tab count is user-controlled (users create groups intentionally), avoiding tab explosion.
- Named groups require two new database tables with RLS policies.
- The "explore → curate → persist" workflow (select on map → review in Active Selection → save as group) becomes a first-class interaction pattern.
- Memory is bounded: only active tab thumbnails + lightweight metadata for inactive tabs.
- Mobile layout uses a bottom sheet with three snap points (minimized, half, full).
- Client state includes: active tab index (localStorage), tab order (localStorage), group membership (server-side).

See `architecture.md` §11 and `database-schema.md` §10.

---

## D15 – Progressive Image Loading Pipeline

**Context**  
Loading full-resolution images for map markers kills bandwidth — especially for the Technician persona on LTE. The docs mentioned "thumbnails for overview" without specifying how thumbnails are created, stored, or loaded.

**Decision**  
Implement a three-tier progressive loading pipeline:

- **Tier 1 – Markers only:** At overview zoom levels, markers/clusters show counts. Zero image bytes are fetched.
- **Tier 2 – Thumbnails (128×128 JPEG):** Generated during the upload pipeline and stored alongside the original in Supabase Storage. The `images` table stores `thumbnail_path`. Thumbnails are loaded when images appear in workspace tabs, popups, or at individual-marker zoom levels. Uses `loading="lazy"` and `IntersectionObserver`.
- **Tier 3 – Full resolution:** Loaded only on explicit user action (click to open detail view, export). Uses signed URLs with 1-hour TTL.

Thumbnail generation happens server-side during upload (Supabase Edge Function or Storage transformation). If client-side generation is used as an interim, the thumbnail must still be uploaded to Storage.

**Consequences**

- Bandwidth usage is dramatically reduced for map browsing (the most common operation).
- The `images` table gains a `thumbnail_path` column (non-nullable, set during upload).
- The ingestion pipeline gains a thumbnail-generation step.
- Signed URL TTL (1 hour) requires a refresh mechanism for long sessions.
- Network priority: map tiles > thumbnails > full-res images.

See `architecture.md` §9 and `database-schema.md` §7.

---

## D16 – Filename-First Location Resolution for Folder Import

**Context**  
When a user imports a folder of images, some images lack EXIF GPS data. Even images that have GPS may be from a device with poor accuracy. However, a technician who organized images into a folder named `Burgstraße_7/` has explicitly communicated the location — that folder name is human-entered, intentional data. EXIF data is automatic and can drift, be cached from a previous location, or be entirely absent. We needed a rule for which source to trust when both are available, and what to do when they disagree.

**Decision**  
Filename and folder-path data is the **primary** location source; EXIF GPS is the **secondary** (complementary) source.

- The `FilenameLocationParser` utility extracts address hints from folder names and filenames (street + number, city, or decimal coordinates).
- Address hints are validated and geocoded via `AddressResolverService`.
- EXIF GPS is extracted in parallel and used to confirm or refine the filename-derived location.
- If both sources are present and agree within 50m → import automatically (use EXIF coordinates for precision, filename address as the human-readable label).
- If both sources are present but disagree by more than 50m → **surface the conflict to the user**. Never resolve silently.
- If only one source is available → use it. Flag provenance accordingly.
- If neither source is available → place in the manual review queue.

**Consequences**

- Users who organize folders by street address get near-zero-friction imports.
- EXIF-only images are still handled gracefully; the EXIF path remains unchanged from single-file upload.
- Conflicts are never hidden — the user is always in control of which source wins.
- `FilenameLocationParser` is a pure, independently testable utility. It carries no side effects and can be improved incrementally without touching the ingestion pipeline.
- The `images` table gains an `address_label` column to store the human-readable address resolved from the filename (or from user input during the review).
- Images without any resolvable location gain a `location_unresolved = TRUE` flag and do not appear on the map until resolved.

See `folder-import.md` and `features.md` §1.14.

---

## D17 – DB-First Address Ranking in AddressResolverService

**Context**  
Sitesnap's main map search bar, upload panel, folder import review, and marker correction workflow all need address lookup with autocomplete. The underlying geocoding adapter (Nominatim by default, per D6) returns generic results from the full OpenStreetMap dataset. However, when a user at a construction company types "Burgs", they are almost certainly looking for "Burgstraße 7" — a site their organization has already documented — not a random Burgstraße in an unrelated city. Returning a neutral, alphabetically sorted list from the geocoder buries the most relevant results.

**Decision**  
Introduce `AddressResolverService` as an application-level service that sits on top of `GeocodingAdapter` and applies **database-first ranking**:

- The service queries the Sitesnap `images` database (org-scoped) for address labels already in the system, using fuzzy trigram similarity (`pg_trgm`), weighted by image count at each address.
- It simultaneously calls `GeocodingAdapter.search()` for external candidates.
- Results are returned as an `AddressCandidateGroup`: up to 3 DB candidates first, a visual separator, then up to 5 geocoder candidates.
- Geocoder results within 30m of a DB candidate are deduplicated.
- All application code that performs address lookup calls `AddressResolverService`, never `GeocodingAdapter` directly.

**Consequences**

- The most likely correct answers (known project locations) appear at the top of every address dropdown without any extra effort from the user.
- The resolver is a single point of change: improving ranking, changing the DB query, or swapping the geocoder all happen in one place.
- The external geocoder boundary (D6) is preserved: `GeocodingAdapter` remains provider-agnostic and `AddressResolverService` remains provider-agnostic above it.
- A `pg_trgm` extension must be enabled on the Supabase PostgreSQL instance (or a `LIKE '%query%'` fallback must be accepted for environments where it is unavailable).
- The `images` table requires an `address_label` column (non-nullable in future migrations; nullable for backward compatibility with existing rows).
- Care must be taken with empty or very short queries: the service enforces a minimum query length of 2 characters before firing any DB or geocoder call.

See `address-resolver.md` and `features.md` §1.15.

---

## Adding New Decisions

When you introduce a change that:

- Alters core invariants,
- Changes data model shape, or
- Introduces a new external dependency,

add a new section here (`Dx`) and link it from relevant docs (e.g., `architecture.md`, `database-schema.md`).
