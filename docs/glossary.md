# Glossary

**Who this is for:** anyone reading or writing Sitesnap code or docs.  
**What you’ll get:** precise definitions of domain terms and where they show up in the system.

---

## Core Domain Terms

- **Sitesnap**  
  The overall system: geo‑temporal image management for construction documentation.

- **User**  
  An authenticated person using Sitesnap.
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
  - Server-side: computed via `ST_SnapToGrid` (see architecture.md §8).
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
  - See `folder-import.md` §4.1.

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
  - All RLS policies use `organization_id` to enforce data isolation between orgs (see security-boundaries.md §2.1).

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
  - See architecture.md §11.

- **Metadata Key**  
  A user-defined property name attached to an image, such as “Fang”, “Türe”, “Material”.
  - Represents a dimension along which images can be searched or filtered.

- **Metadata Value**  
  The concrete value assigned to a metadata key for a given image.
  - Example: key `Material`, value `Beton`.

- **Custom Properties**  
  The end-user feature for defining and managing metadata keys and their values on images. Encompasses the UI for creating new keys, assigning values, and filtering by metadata. Built on the `metadata_keys` and `metadata_values` tables.

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
- **GiST Index**  
  Generalized Search Tree index used by PostGIS for efficient spatial queries.
  - Applied to `images.geog` for bounding-box and distance queries.

- **MapAdapter**  
  An abstraction layer over the map library (Leaflet).
  - Defined in architecture.md §6.
  - Ensures the Angular application never calls Leaflet APIs directly, making it swappable.

- **AddressResolverService**  
  An Angular service (`providedIn: 'root'`) that resolves address queries to a ranked list of geographic candidates.
  - Queries the Sitesnap database first (DB-first ranking), then calls `GeocodingAdapter` for external results.
  - Returns results as `AddressCandidateGroup`: `databaseCandidates` first (up to 3), then `geocoderCandidates` (up to 5), separated by a visual divider.
  - Used at every address-input point in the application: map search bar, upload panel, folder import review, marker correction.
  - See `address-resolver.md`.

- **FolderImportAdapter**  
  An `ImageInputAdapter` implementation that wraps the browser File System Access API (`showDirectoryPicker()`).
  - Recursively scans a user-selected folder for images and feeds them into the core ingestion pipeline.
  - Requires a Chromium-based browser (Chrome 86+, Edge 86+).
  - See `folder-import.md`.

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

## UI Structural Elements

Canonical names for every visible piece of the interface. Use these in code, docs, and conversation.

### Shell & Layout

- **Map Shell**  
  Top-level full-screen host component (`MapShellComponent`). Horizontal flex row containing all map-page children. Background: `--color-bg-base`.

- **Map Zone**  
  `flex: 1` container holding the Leaflet map and all floating controls (search bar, GPS button, placement banner). Fills remaining space after sidebar.

- **Map Container**  
  The `<div #mapContainer>` where Leaflet mounts. Gets a `--placing` modifier class for crosshair cursor during placement mode.

- **Sidebar**  
  Floating pill navigation rail on the left (48 px collapsed / 240 px expanded). Mobile (<768 px): fixed bottom tab bar. Contains nav links (Map, Photos, Groups, Settings) and bottom avatar slot.

- **Sidebar Panel**  
  Inner panel inside the sidebar holding the nav list, spacer, and avatar slot.

- **Sidebar Pill**  
  40×4 px visual pill affordance at 50 % height of the collapsed sidebar strip. Cues interactivity.

- **Workspace Pane**  
  Right-side collapsible, resizable panel (320 px default, 280–640 px range). Houses group tabs + thumbnail gallery + inline detail view. Desktop: slides in from right. Mobile: bottom sheet.

- **Drag Divider**  
  4 px vertical (desktop) / horizontal (mobile) separator between map and workspace pane. `cursor: col-resize`. Shown only when workspace pane is open.

- **Bottom Sheet** _(mobile only)_  
  Container replacing the workspace pane on small screens. Three snap points: minimized (64 px), half-screen (50 vh), full-screen (100 vh). Drag handle at top.

### Search

- **Search Bar**  
  Pill-shaped input floating top-center over the map. Multi-intent surface: place search, evidence search, command palette (`Cmd/Ctrl+K`). Five states: Idle, Focused-empty, Typing, Results, Committed.

- **Search Input**  
  The `<input type="search">` inside the search bar. 40 px height.

- **Search Dropdown**  
  In-flow panel below the search input (not a separate overlay). Shows recent searches (focused-empty) or split DB results + geocoder results (typing). `role="listbox"`.

- **Search Dropdown Section Label**  
  Uppercase, small-text header labelling each section ("Recent searches", "Projects", "Places").

- **Search Dropdown Item**  
  Clickable row: icon + label. Used for recent searches, DB matches, geocoder results, and suggestions.

- **Search Dropdown Divider**  
  1 px horizontal line separating DB results from geocoder results.

- **Search Clear Button**  
  Inline `×` inside the input (right side) after a committed search. Clears query + committed target.

- **Search Location Marker**  
  20 px circle in `--color-clay` with white border. Placed on the map at the committed geocoded location.

### Map Markers & Clusters

- **Photo Marker**  
  Square body (3.5 rem) with a small pointer tail that anchors to the GPS/address coordinate. 2 px white outline, drop shadow. Semantic fill colour per state. Never the default Leaflet blue pin.

- **Photo Marker Body**  
  The square part of the marker. `rounded-md`, `overflow: hidden`, 2 px `--color-bg-surface` border. Contains thumbnail image or cluster count.

- **Photo Marker Tail**  
  CSS triangle (0.6 rem) below the marker body pointing down to the exact coordinate. When markers separate due to overlap the tail dynamically points to the true origin.

- **Single Photo Marker**  
  Variant with `--color-bg-surface` body containing an `<img>` thumbnail.

- **Count Marker (Cluster)**  
  Variant with `--color-clay` background showing a count number. Triggered by proximity density, not by fixed zoom-level tiers.

- **Correction Indicator Dot**  
  Small dot in `--color-accent` at the top-right corner. Visible only for corrected markers.

- **Pending Upload Indicator**  
  Pulsing ring in `--color-warning` around a marker whose image is still uploading.

- **User Location Marker**  
  18 px circle in `--color-primary` with 3 px white border and outer glow. Appears on GPS fix.

- **Direction Cone**  
  30° semi-transparent cone on marker hover visualising the camera's compass bearing from EXIF.

### Upload UI

- **Upload Button**  
  44 px circle in `--color-clay`, fixed top-right. Click toggles the upload panel. Mobile spec: 56 px FAB bottom-right.

- **Upload Button Zone**  
  Fixed-position container (top-right) holding the upload button + expanded panel in a column layout.

- **Upload Panel**  
  Slides down from upload button. Glassmorphic background (95 % surface + blur). Contains header, drop zone, and file list.

- **Drop Zone**  
  Dashed-border area inside the upload panel. Camera icon + drag-and-drop prompt + accepted-types hint.

- **File List**  
  `<ul>` of per-file items showing upload progress.

- **File Item**  
  Grid row: dismiss button, thumbnail + meta, retry. Status-dependent background tint (green / red / amber).

- **File Thumbnail**  
  48×48 px `object-fit: cover` preview (object URL).

- **File Status Label**  
  Per-file text reflecting state: "Queued", "Reading EXIF…", "Uploading…", "Uploaded", "Upload failed", "Place on map".

- **Upload Progress Bar**  
  Per-file `<progress>` element shown while uploading.

- **Dismiss Button**  
  `×` icon button removing a file entry from the upload queue.

- **Retry Button**  
  "↺ Retry" ghost button for failed uploads.

- **Placement Prompt**  
  Inline warning: "No GPS data found — click the map to place this image."

### Placement Mode

- **Placement Banner**  
  Bottom-center floating pill. Pin-drop icon + instructional text + Cancel button. `role="status"`.

- **Placement Cancel Button**  
  Ghost pill button inside the placement banner.

- **Placement Crosshair Cursor**  
  `cursor: crosshair` applied to the map container while placement mode is active.

### Workspace & Group Tabs

- **Group Tab Bar**  
  Scrollable horizontal row of group tabs inside the workspace pane.

- **Active Selection Tab**  
  Pinned leftmost tab. Ephemeral, cannot be renamed/closed. Populated by radius selection or marker clicks.

- **Named Group Tab**  
  User-created persistent tab. Long-press → rename / delete context menu.

- **"+" New Group Button**  
  Button at the right end of the tab row to create a new group.

- **Thumbnail Grid**  
  Scrollable grid of 128×128 thumbnail cards within each group tab. Virtual scrolling.

- **Thumbnail Card**  
  128×128 px thumbnail: bottom-left capture date, bottom-right project badge, top-right metadata preview / correction dot. Hover-to-reveal controls.

- **Sorting Controls**  
  Compact segmented control above the gallery: Date ↓, Date ↑, Distance, Name.

- **Sort Dropdown**  
  Dropdown menu within the workspace toolbar for choosing the sort order of thumbnails (date ascending, date descending, distance, name).

- **Grouping Dropdown**  
  Dropdown menu within the workspace toolbar for choosing how thumbnails are grouped (by date, project, location, or none).

- **Workspace Toolbar**  
  Horizontal bar above the thumbnail grid inside the workspace pane. Hosts sort dropdown, grouping dropdown, and view-mode toggle.

- **Workspace View System**  
  The mechanism for switching between workspace display modes (grid view, list view, map-only). Controlled via the workspace toolbar.

### Panels & Detail Views

- **Filter Panel**  
  Grouped accordion panel. Desktop: slides in from top-right. Mobile: bottom modal. Contains time range, project, metadata, max distance groups, and applied-filters summary.

- **Filter Dropdown**  
  Shared dropdown primitive used inside the filter panel for project, metadata key, and other selection inputs.

- **Projects Dropdown**  
  Specialization of filter dropdown for selecting a project to filter by. Populated from the `projects` table.

- **Active Filter Chips Strip**  
  Compact chip row above the map search bar. Each chip has a `×` to remove inline. Visible when any filter is active.

- **Filter Chip**  
  Individual pill showing one active filter constraint.

- **Image Detail View**  
  Desktop: inline in workspace pane (replaces gallery, back arrow to return). Mobile: full-screen overlay. Shows full-res image, metadata rows, coordinates, correction history, actions menu.

- **Metadata Property Row**  
  Two-column row: key left, editable value right. Click value → inline text input.

### Controls & Buttons

- **GPS Button**  
  44 px circle, bottom-right of map zone. `my_location` icon. Locating state: spinner replaces icon.

- **Theme Toggle**  
  Toolbar button cycling light → dark → system. `--color-clay` fill accent.

- **Ghost Button**  
  Default non-primary button style. Transparent background, fill on hover.

- **Filled Button**  
  Primary CTA. `--color-primary` fill, 40 px height.

- **Compact Button**  
  28 px visual height. Workspace inline micro-actions, tab chips, command palette results.

### Spatial Selection

- **Radius Selection Circle**  
  Semi-transparent circle drawn via right-click + drag (desktop) or long-press + drag (mobile).

- **Radius Label**  
  Floating chip above the circle showing radius in metres.

- **Radius Drag Handles**  
  Draggable handles on cardinal points for resizing after initial draw.

### Navigation Items

- **Nav Link**  
  Icon + label pair in the sidebar. Active state via `routerLinkActive`.

- **Nav Icon**  
  Material icon within each nav link, 20 px.

- **Nav Label**  
  Text label next to the nav icon. Visible when sidebar is expanded.

- **Avatar Slot**  
  Bottom of sidebar. Circle showing user's initial letter. Links to `/account`.

### Empty States

- **No Images in Viewport:** "Nothing here yet" + "Try adjusting filters" + "Clear filters" button.
- **Empty Group:** "This group is empty" + "Add images from the map" + "Go to map" button.
- **No Search Results:** "No address found" + "Try a different address or pin manually" + "Drop pin" button.
- **First Login / Welcome:** "Welcome to Sitesnap" + "Start by uploading photos" + "Upload photos" button.

### Page-Level Components (placeholder)

- **Photos Page** — responsive thumbnail grid + empty state + cursor pagination.
- **Groups Page** — groups list + detail + create / rename / delete.
- **Settings Page** — theme control (light / dark / system) with persisted preference.
- **Account Page** — email / password change + delete-account flow.

---

## Usage Notes

- Prefer these terms in code, UI, and docs to avoid ambiguity.
- When introducing a new domain concept, add it here and link to the relevant table or module.
