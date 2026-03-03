# GeoSite Documentation Audit

**Date:** 2026-03-03  
**Scope:** All files in `docs/`. Full read of project-description, architecture, database-schema, features, decisions, use-cases, security-boundaries, glossary, milestones, user-lifecycle, and setup-guide.  
**Goal:** Identify issues, rank by impact, deep-dive the three known concerns, and flag required doc changes.

---

## Table of Contents

- [Part A — Deep-Dive: Three Known Concerns](#part-a--deep-dive-three-known-concerns)
  - [Concern 1: Map + Image Loading Performance](#concern-1-map--image-loading-performance)
  - [Concern 2: Spatial Selection UX](#concern-2-spatial-selection-ux)
  - [Concern 3: Split-Screen Layout with Tabbed Image Workspace](#concern-3-split-screen-layout-with-tabbed-image-workspace)
- [Part B — Full Issue Registry (100 Issues)](#part-b--full-issue-registry-100-issues)
  - [Tier 1 — Critical (Issues 1-20)](#tier-1--critical-issues-1-20)
  - [Tier 2 — High (Issues 21-50)](#tier-2--high-issues-21-50)
  - [Tier 3 — Medium (Issues 51-80)](#tier-3--medium-issues-51-80)
  - [Tier 4 — Low / Cosmetic (Issues 81-100)](#tier-4--low--cosmetic-issues-81-100)

---

# Part A — Deep-Dive: Three Known Concerns

---

## Concern 1: Map + Image Loading Performance

### Problem Statement

Invariant I4 says "the system must never load all images at once", and features.md lists viewport-bounded loading (F12) and marker clustering (F13). But the docs don't specify **how** this works at scale. With tens of thousands of images in a dense urban area, a naive bounding-box query can still return thousands of rows for a single viewport. The current indexing strategy (btree on `latitude, longitude`) doesn't efficiently support bounding-box range scans at geographic scale — it's essentially a 1D index on a 2D problem.

### Interaction with Current Indexing Strategy

`database-schema.md` section 8 defines:

- `images (latitude, longitude)` — a composite btree index.
- PostGIS with GiST index is listed as "optional/preferred".

**The problem:** A btree composite index on `(latitude, longitude)` is efficient for exact-match or narrow-range queries on the _first_ column (latitude), but the second column (longitude) only helps within matched latitude ranges. For a bounding-box query like `WHERE lat BETWEEN x1 AND x2 AND lng BETWEEN y1 AND y2`, Postgres will range-scan on latitude and then filter on longitude — which is far worse than a true spatial index at high row counts. This is a **known anti-pattern** for spatial queries.

The docs acknowledge PostGIS as preferred, but marking it "optional" sends the wrong signal — it should be the **MVP default** for any dataset beyond a few thousand images.

### Solution A: Server-Side Clustering with PostGIS + ST_ClusterDBSCAN

**How it works:**  
Move to a `geography(Point, 4326)` column with a GiST index. On the server, use `ST_ClusterDBSCAN` or grid-based snapping (`ST_SnapToGrid`) to pre-aggregate points before returning them to the client. The server returns cluster centroids + counts at low zoom levels, and individual markers only when the viewport contains a manageable number of points.

**Implementation:**

```sql
-- Add geography column (migration)
ALTER TABLE images ADD COLUMN geog geography(Point, 4326);
UPDATE images SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography;
CREATE INDEX idx_images_geog ON images USING GIST (geog);

-- Viewport query with server-side clustering
SELECT
  ST_X(ST_Centroid(ST_Collect(geog::geometry))) AS cluster_lng,
  ST_Y(ST_Centroid(ST_Collect(geog::geometry))) AS cluster_lat,
  count(*) AS point_count,
  array_agg(id) AS image_ids
FROM images
WHERE geog && ST_MakeEnvelope(:west, :south, :east, :north, 4326)::geography
GROUP BY ST_SnapToGrid(geog::geometry, :grid_size);
```

**Trade-offs:**
| Pro | Con |
|---|---|
| Truly scalable — cluster count stays bounded regardless of total images | Requires PostGIS extension (Supabase supports it, but must be enabled) |
| Single round-trip returns exactly what the map needs | Grid-size parameter must be tuned per zoom level |
| GiST index makes bounding-box queries orders of magnitude faster | Migration needed for existing btree-indexed data |
| Eliminates client-side clustering overhead | Slightly more complex SQL / RPC functions |

**Doc changes required:** `database-schema.md` (promote PostGIS to MVP), `architecture.md` (add server-side clustering contract), `decisions.md` (new ADR).

### Solution B: Tile-Based Geohash Bucketing (No PostGIS)

**How it works:**  
Add a `geohash` text column to `images`. Pre-compute geohash strings at upload time. For map queries, compute the geohash prefixes that cover the current viewport at the appropriate precision level (shorter prefix = lower zoom = larger area). Query with `WHERE geohash LIKE 'u33d%'` using a btree index on the geohash column. Group by geohash prefix for clustering.

**Implementation:**

```sql
ALTER TABLE images ADD COLUMN geohash text;
CREATE INDEX idx_images_geohash ON images (geohash);

-- Query: viewport at zoom level ~14 (precision 6)
SELECT
  LEFT(geohash, 6) AS bucket,
  count(*) AS point_count,
  AVG(latitude) AS cluster_lat,
  AVG(longitude) AS cluster_lng
FROM images
WHERE geohash BETWEEN :sw_geohash AND :ne_geohash
GROUP BY LEFT(geohash, 6);
```

**Trade-offs:**
| Pro | Con |
|---|---|
| Pure btree — no PostGIS dependency | Geohash edge-splitting: cells at boundaries of the 32-division grid can split nearby points into different buckets |
| Very fast prefix queries | Distance calculations are imprecise compared to PostGIS geography |
| Easy to understand and debug | Requires maintaining geohash on insert/update and on coordinate correction |
| Works on vanilla Postgres | Not a standard spatial pattern — less community tooling |

**Doc changes required:** `database-schema.md` (add geohash column + index), `architecture.md` (geohash bucketing contract).

### Solution C: Client-Side Clustering with Viewport-Bounded Fetch + Hybrid Caching

**How it works:**  
Keep the current schema. The server returns raw points within the viewport (with a hard `LIMIT` and server-side pagination). The client uses a library like **Supercluster** (WebGL-accelerated) to cluster points in the browser. Cache fetched tiles by their viewport key so panning to a previously-seen area doesn't re-fetch.

**Implementation:**

- Server: `SELECT id, latitude, longitude, file_url FROM images WHERE lat BETWEEN ... AND lng BETWEEN ... ORDER BY created_at DESC LIMIT 2000`
- Client: Feed results into Supercluster, which produces cluster objects for the current zoom level.
- Cache: `Map<viewportKey, ImagePoint[]>` with TTL eviction.

**Trade-offs:**
| Pro | Con |
|---|---|
| Minimal server changes — no PostGIS, no schema migration | 2000-point hard limit means dense areas silently drop data |
| Supercluster is battle-tested (used by Mapbox GL) | Client bears clustering CPU cost — stutters on low-end mobile (Technician persona) |
| Can be implemented quickly for MVP | Not truly scalable — at 100k+ images the limit becomes a UX lie |
| Viewport caching reduces repeat fetches | Cache invalidation after new uploads is non-trivial |

**Doc changes required:** `architecture.md` (add client clustering contract + caching), `features.md` (document LIMIT guardrail).

### Recommendation

**Solution A (PostGIS + server-side clustering) is the right choice.** Supabase already supports PostGIS. It solves the 2D indexing problem at the root and keeps mobile clients thin. Solution B is a reasonable fallback if PostGIS is truly off the table. Solution C is acceptable only as a short-term interim for very early prototyping.

### Progressive Image Loading Strategy

Regardless of clustering solution, the image loading pipeline needs its own layered strategy:

**Layer 1 — Map markers only (no images loaded):** At overview zoom levels, markers/clusters show counts only. Zero image bytes are fetched.

**Layer 2 — Low-res thumbnails on cluster expand / medium zoom:** When a user zooms into a cluster or clicks to expand, fetch thumbnail URLs (64x64 or 128x128). These should be pre-generated on upload and stored alongside the original. Supabase Storage supports image transformations — use `?width=128&height=128` on the storage URL or pre-generate and store a `thumbnail_url` column.

**Layer 3 — Full resolution on click / detail view:** Only when a user opens a specific image in the detail pane, fetch the full-resolution file. Use `loading="lazy"` and `IntersectionObserver` if displaying a list.

**Doc changes required:** `database-schema.md` (add `thumbnail_url` column or document transformation strategy), `architecture.md` (document 3-tier loading), `features.md` (expand F15 and F22).

---

## Concern 2: Spatial Selection UX

### The Proposed Pattern: Right-Click + Drag Radius Circle

User right-clicks on the map and drags outward → a circle grows from the click point → releasing selects all images within the radius. The selection immediately populates the "Active Selection" tab in the workspace pane.

### Evaluation

**Strengths:**

- Highly intuitive for "show me everything within X meters of this point" — directly maps to UC1 (Technician on site).
- Visual feedback is immediate (expanding circle).
- The radius is user-defined rather than preset, giving more control than the existing distance filter (F19).
- **Right-click drag has no default behaviour in Leaflet, Google Maps, or Mapbox.** This completely avoids the pan-conflict problem that would plague left-click drag. It's a clean, unoccupied gesture slot.

**Potential concerns and mitigations:**

- **Browser context menu:** Right-click normally opens the browser's context menu. The map component must call `preventDefault()` on the `contextmenu` event over the map canvas. This is standard practice (Google Maps, QGIS web, Mapbox Studio all suppress it).
- **Mobile equivalent:** Right-click doesn't exist natively on touch. Use **two-finger tap + drag** or **long-press + drag** as the mobile equivalent. Long-press is preferred because it's a single-hand gesture (Technician persona, one hand on phone).
- **Discoverability:** Right-click drag is not a universally expected gesture. A tooltip on first use ("Tip: right-click and drag to select an area") and a fallback toolbar button for the same action ensure discoverability.

### Implementation Details

**Desktop:**

1. User right-clicks on the map and holds.
2. `contextmenu` event is suppressed; cursor changes to crosshair.
3. As the user drags, a circle overlay grows from the click origin. The radius in meters is displayed as a dynamic label on the circle edge.
4. On release (`mouseup`), the circle is finalized:
   - A PostGIS `ST_DWithin` query (or client-side distance filter) identifies all images within the radius.
   - Results populate the "Active Selection" tab in the workspace pane.
   - The circle overlay persists on the map with a visible radius label and a dismiss (✕) button.
5. Dragging the circle edge adjusts the radius. Dragging the center repositions it. This allows refinement without redrawing.
6. Clicking the ✕ or pressing `Escape` clears the selection circle.

**Mobile (long-press + drag):**

1. User long-presses (≥500ms) on the map.
2. Haptic feedback (where available) signals selection mode is active.
3. Without lifting, the user drags outward to set the radius.
4. On release, same behavior as desktop step 4.
5. The circle can be refined by dragging handles.

**MapAdapter interface additions:**

```typescript
/** Enable radius selection via right-click drag (desktop) or long-press drag (mobile). */
enableRadiusSelection(options?: RadiusSelectionOptions): void;

/** Disable radius selection and remove any active circle overlay. */
disableRadiusSelection(): void;

/** Fires when the user completes a radius selection. */
onRadiusSelect(callback: (center: LatLng, radiusMeters: number) => void): void;

/** Fires when the user modifies an existing selection (drag edge or center). */
onRadiusChange(callback: (center: LatLng, radiusMeters: number) => void): void;

/** Fires when the user dismisses the selection circle. */
onRadiusClear(callback: () => void): void;

interface RadiusSelectionOptions {
  maxRadiusMeters?: number;  // Default: 5000
  circleStyle?: { color: string; fillOpacity: number };
  showRadiusLabel?: boolean; // Default: true
}
```

**Query integration:**
On selection complete, the frontend calls a Supabase RPC or query:

```sql
SELECT id, latitude, longitude, thumbnail_url
FROM images
WHERE ST_DWithin(geog, ST_MakePoint(:lng, :lat)::geography, :radius_meters)
ORDER BY geog <-> ST_MakePoint(:lng, :lat)::geography
LIMIT :page_size;
```

### Alternative: Toolbar Radius Button (Fallback / Accessibility)

For users who don't discover right-click drag, or for accessibility:

- A toolbar button (crosshair icon) enters "selection mode" where left-click + drag draws the circle.
- This is the same as the mode-toggle approach but exists as a **secondary** path, not the primary one.
- Keyboard shortcut: `S` to toggle selection mode.

### Post-MVP: Lasso / Polygon Selection

Lasso selection (click points to draw a freeform polygon) is a natural extension for irregularly shaped areas (e.g., along a road). This requires PostGIS `ST_Contains` on a constructed polygon and is deferred to post-MVP.

**Doc changes required:** `features.md` (new feature: spatial selection), `use-cases.md` (extend UC1/UC2 with selection flow), `architecture.md` (MapAdapter radius selection events), `decisions.md` (new ADR).

---

## Concern 3: Split-Screen Layout with Group-Based Tabbed Workspace

### The Proposed Pattern (Corrected Understanding)

- Left pane: map (always visible).
- Right pane: opens dynamically as a workspace.
- Right pane has **group-based tabs** (not per-image tabs):
  - A persistent **"Active Selection"** tab showing whatever is currently selected on the map (via radius selection, filter, or marker clicks).
  - **User-created named group tabs**: the user creates a group, gives it a name, and it opens as a tab. Each tab holds any number of images.
  - A tab represents a _collection_, not a single image.

This is closer to a workbench model (think: Photoshop layer groups, Figma pages) than a browser-tab model.

### Evaluation

**Strengths:**

- **Tab count is user-controlled.** Users only get new tabs when they intentionally create a group. There is no tab-per-click explosion. A typical workflow might involve 2-5 groups ("Quote Site A", "Foundation Photos", "Active Selection") — well within the usability sweet spot.
- **Persistent "Active Selection" tab** gives spatial selection (Concern 2) an always-visible home. The user can draw a radius, see results in Active Selection, then save interesting images to a named group — a clean two-step curation flow.
- **Named groups enable real workflow organization.** The Clerk persona (UC2) can create groups like "Quote 2026-03 Zürich" and gather relevant images across multiple map locations. This goes beyond a single spatial query.
- **Map stays visible** while reviewing images — critical for maintaining spatial context.
- **Groups persist across sessions** via database storage, so the Clerk can return to their work the next day.

**Potential concerns and mitigations:**

| Concern                                                      | Mitigation                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile layout:** Split-screen doesn't work on phones       | On mobile, the workspace becomes a **bottom sheet**. Tabs become a horizontal **chip bar** at the top of the sheet. Tapping a chip switches the active group. The sheet slides up from the bottom, overlaying the map partially (like Google Maps). Swipe down to minimize. |
| **Memory pressure:** Many images across multiple group tabs  | Only the **active tab's** thumbnails are rendered. Inactive tabs hold metadata only (id, lat/lng, thumbnail URL — a few KB per image). Full-resolution images load only on explicit open within a tab. With 5 groups × 50 images each, metadata cost is ~50KB — negligible. |
| **State complexity:** Tab order, membership, active tab      | Group membership is persisted server-side (`saved_groups` + `saved_group_images` tables). Active tab and tab order are lightweight client state persisted to `localStorage`. The "Active Selection" tab is ephemeral (never persisted — it reflects current map selection). |
| **Discoverability:** Users need to understand group creation | "Save as Group" button appears in the Active Selection tab when images are selected. A keyboard shortcut (`Ctrl+G` / `Cmd+G`) creates a group from the current selection. Named groups also appear in the left sidebar for navigation.                                      |

### Layout Architecture

**Desktop (≥1024px):**

```
┌──────────────────────────────────────────────────────────┐
│ Toolbar: Search Bar │ Filters │ Upload │ Theme Toggle    │
├──────────┬───────────────────────────────────────────────┤
│          │  ┌─────────┬─────────┬──────────┐            │
│  Sidebar │  │ Active  │ Quote   │ Found-   │  [+] [✕]  │
│  (nav)   │  │ Select. │ Zürich  │ ation    │            │
│          │  ├─────────┴─────────┴──────────┤            │
│          │  │                               │            │
│   Map    │  │   Group content: thumbnail    │  Workspace │
│          │  │   grid with metadata, sort,   │  Pane      │
│          │  │   and image detail on click    │            │
│          │  │                               │            │
│          │  │   [Save as Group] [Export]     │            │
│          │  │   [Remove from Group]          │            │
├──────────┴──┴───────────────────────────────┴────────────┤
│ Status bar: x images in view │ selection: y images       │
└──────────────────────────────────────────────────────────┘
```

- The workspace pane is **collapsible** (drag handle or toggle button). When collapsed, the map takes full width.
- The pane width is resizable (drag the divider). Default: 35% of viewport. Min: 300px, Max: 50%.

**Mobile (<1024px):**

```
┌────────────────────────┐
│ Search Bar │ Filters ▾ │
├────────────────────────┤
│                        │
│        Map (full)      │
│                        │
├────────────────────────┤  ← Bottom sheet (swipe up)
│ [Active] [Quote] [+]  │  ← Chip bar (horizontal scroll)
├────────────────────────┤
│  Thumbnail grid        │
│  (scrollable)          │
└────────────────────────┘
```

- Bottom sheet has three snap points: **minimized** (chip bar only, ~48px), **half** (50% of screen), **full** (90% of screen).
- Tapping an image in the sheet opens a **full-screen detail view** with a back button.

### Tab Lifecycle

| Action                     | Result                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radius selection on map    | Active Selection tab updates with selected images. Tab auto-focuses.                                                                                                  |
| Click marker on map        | Image highlighted in Active Selection (scroll-to + highlight), or opens image detail if workspace is collapsed.                                                       |
| Click "Save as Group"      | Prompt for group name → new named tab created → images copied from Active Selection to the new group. Active Selection is NOT cleared (allows continued exploration). |
| Close a named tab (✕)      | Group persists in the database but tab is hidden. Re-openable from sidebar → "My Groups."                                                                             |
| Close Active Selection tab | Not allowed — it's always present (can be empty).                                                                                                                     |
| Add image to group         | From image detail or thumbnail context menu: "Add to Group → [group name]."                                                                                           |
| Remove image from group    | From thumbnail context menu within the group tab: "Remove from Group."                                                                                                |
| Delete a group             | From tab context menu or sidebar: "Delete Group." Removes `saved_groups` and `saved_group_images` rows. Does NOT delete the images themselves.                        |
| Reorder tabs               | Drag-and-drop tabs to reorder. Active Selection is always pinned first.                                                                                               |

### Within a Group Tab

Each tab displays its images as a **scrollable thumbnail grid** with:

- Thumbnail (128×128) with lazy loading.
- Capture date overlay.
- Project badge.
- On hover: metadata preview tooltip.
- On click: inline detail expansion (image expands within the pane with full metadata, full-res image loads on demand).
- Sort controls: by date (newest/oldest), by distance from current map center, by name.
- Bulk actions: select multiple → "Remove from Group", "Move to Group", "Export".

### Integration with Spatial Selection (Concern 2)

The radius selection from Concern 2 feeds directly into this workspace:

1. User right-click drags on map → circle drawn → images within radius identified.
2. Active Selection tab populates with the results.
3. User reviews thumbnails in the Active Selection tab.
4. User optionally clicks "Save as Group" to persist interesting images.
5. User can then clear the radius and make a new selection — Active Selection updates, but the saved group remains intact.

This creates a natural **explore → curate → persist** workflow.

### Schema for Groups

```sql
CREATE TABLE saved_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tab_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_group_images (
  group_id uuid NOT NULL REFERENCES saved_groups(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, image_id)
);

-- Indexes
CREATE INDEX idx_saved_groups_user ON saved_groups (user_id, tab_order);
CREATE INDEX idx_saved_group_images_image ON saved_group_images (image_id);

-- RLS
ALTER TABLE saved_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_groups_owner ON saved_groups
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE saved_group_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_group_images_owner ON saved_group_images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM saved_groups sg WHERE sg.id = group_id AND sg.user_id = auth.uid())
  );
```

### Performance Contract

- **Max groups per user:** Soft limit of 20 (UI warns, doesn't block). Hard limit of 50 (server rejects).
- **Max images per group:** No hard limit, but the thumbnail grid uses **virtual scrolling** (only visible thumbnails are rendered). A group with 500 images renders ~20 thumbnails at a time.
- **Tab rendering:** Only the active tab's thumbnail grid is in the DOM. Inactive tabs are not rendered (Angular `@if` / `ngIf` on active state).
- **Image loading within a tab:** Thumbnails use `loading="lazy"` and `IntersectionObserver`. Full-res loads only on explicit click.

**Doc changes required:** `architecture.md` (layout contract, workspace architecture), `features.md` (group workspace features), `database-schema.md` (saved_groups tables), `decisions.md` (new ADR), `use-cases.md` (UC1/UC2 update).

---

# Part B — Full Issue Registry (100 Issues)

Legend:

- **Severity**: Critical / High / Medium / Low
- **Docs affected**: which files need changes
- **Type**: Performance, UX, Security, Data Integrity, Doc Gap, Consistency, Scalability

---

## Tier 1 — Critical (Issues 1-20)

### 1. Btree index on (lat, lng) is ineffective for 2D bounding-box queries

- **Type:** Performance
- **Where:** `database-schema.md` §8
- **Problem:** Composite btree indexes are one-dimensional. A `WHERE lat BETWEEN x1 AND x2 AND lng BETWEEN y1 AND y2` query scans all matching latitudes and then filters longitude — effectively a partial scan at scale.
- **Fix:** Promote PostGIS `geography(Point, 4326)` + GiST index from "optional" to MVP default. See Concern 1, Solution A.
- **Docs affected:** `database-schema.md`, `decisions.md` (new ADR), `architecture.md`

### 2. No thumbnail generation strategy documented

- **Type:** Performance / UX
- **Where:** Across docs — mentioned in passing (F22, project-description §8) but never specified
- **Problem:** "Thumbnails for overview" is stated as a requirement, but no doc specifies how thumbnails are created, what size they are, where they're stored, or how they relate to the `images` table. Without this, engineers will fetch full-res images for map popups and kill mobile bandwidth.
- **Fix:** Document thumbnail generation on upload (Supabase Storage transformations or pre-generated file), add `thumbnail_url` column or document the URL transformation contract.
- **Docs affected:** `database-schema.md`, `architecture.md`, `features.md` (F22)

### 3. No server-side pagination contract for viewport queries

- **Type:** Performance / Scalability
- **Where:** `features.md` F12 says "server-side pagination and limits" but no contract exists
- **Problem:** Without defined `LIMIT`, `OFFSET` or cursor strategy, implementations will diverge. A dense viewport could return 10,000 rows. What's the page size? Cursor-based or offset? What happens when the user pans — does pagination reset?
- **Fix:** Define pagination contract: cursor-based (keyset) by `(distance, id)` or `(created_at, id)`. Default page size, max page size, and behavior on viewport change.
- **Docs affected:** `architecture.md`, `features.md`, `database-schema.md` (index coverage for cursor columns)

### 4. No map viewport change debounce/throttle strategy

- **Type:** Performance
- **Where:** Not documented anywhere
- **Problem:** Every `moveend` or `zoomend` event on Leaflet triggers a query. Rapid panning (especially on mobile) can fire 10+ events per second, each generating a Supabase query. This will overload the database and burn through Supabase rate limits.
- **Fix:** Document a debounce contract (e.g., 300ms after last viewport change) and optional abort-previous-request pattern. This belongs in the `MapAdapter` or a dedicated `ViewportQueryService`.
- **Docs affected:** `architecture.md` (add viewport query lifecycle)

### 5. `MapAdapter` interface lacks cluster interaction methods

- **Type:** Architecture Gap
- **Where:** `architecture.md` §6
- **Problem:** `MapAdapter` has `renderClusters(groups: ClusterGroup[])` but no `onClusterClick` callback. There's no way for Angular components to respond when a user clicks a cluster (to zoom in or expand). The interface also lacks `getBounds()`, `getZoom()`, and `onViewportChange()` — all essential for viewport-bounded loading.
- **Fix:** Extend `MapAdapter` interface with viewport and interaction events.
- **Docs affected:** `architecture.md` §6, `decisions.md` (amend D8)

### 6. Missing EXIF fallback path for images without GPS data

- **Type:** Data Integrity / UX
- **Where:** `features.md` F6, `use-cases.md` UC3
- **Problem:** The docs say EXIF extraction happens automatically, but never specify what happens when an image has **no EXIF GPS data**. Invariant I2 requires every image to have spatial context. How is this enforced? Is the user forced to manually place a marker? Does the upload fail? The milestone M6 lists this as an open TODO.
- **Fix:** Document the fallback: (a) user must manually place marker, or (b) use current map center, or (c) upload is rejected. Each has different UX and data integrity implications.
- **Docs affected:** `features.md`, `use-cases.md` (UC3), `architecture.md`

### 7. No concurrent upload handling specified

- **Type:** Performance / UX
- **Where:** `architecture.md` §5, `features.md` F5
- **Problem:** UC3 says "selects one or more images." What happens with 50 images? Sequential upload would take minutes. Parallel upload could overwhelm Supabase rate limits. No docs specify batch size, parallelism limit, progress indicator, or partial failure handling.
- **Fix:** Document upload concurrency contract: max parallel uploads (e.g., 3-5), per-file progress, partial success handling (some succeed, some fail), retry policy.
- **Docs affected:** `architecture.md` (ingestion pipeline), `features.md`, `use-cases.md` (UC3)

### 8. No image size/format validation on upload

- **Type:** Performance / Security
- **Where:** `architecture.md` §5
- **Problem:** Nothing prevents a user from uploading a 200MB TIFF or a non-image file. No maximum file size, accepted MIME types, or dimension constraints are documented. Large files will blow up storage costs and break thumbnail generation.
- **Fix:** Document validation rules: max file size (e.g., 25MB), accepted types (JPEG, PNG, HEIC, WebP), max dimensions. Validate client-side for UX and server-side (Supabase Storage policy) for security.
- **Docs affected:** `architecture.md`, `features.md`, `security-boundaries.md` (storage policy)

### 9. No layout/responsive design contract

- **Type:** UX
- **Where:** Across docs — no responsive design specification exists
- **Problem:** The Technician persona uses a smartphone. The Clerk uses a desktop. The docs describe a desktop-centric layout (address bar, filter panel, map, side panel) but never address how this collapses on mobile. No breakpoints, no mobile-first wireframes, no responsive behavior contract.
- **Fix:** Add a responsive layout section to `architecture.md`: mobile breakpoint behavior, component stacking order, what hides/collapses on small screens. See Concern 3, Solution A for the bottom-sheet pattern.
- **Docs affected:** `architecture.md`, `features.md`

### 10. Distance filter (F19) has no defined reference point source

- **Type:** UX / Ambiguity
- **Where:** `features.md` F19, `decisions.md` D7
- **Problem:** "Restrict results by max distance from a reference point." What IS the reference point? The user's GPS location? The map center? A clicked point? D7 mentions "clicking a cluster or reference point" but F19 doesn't specify the UI for setting one. This is the most common filter for UC1 and it's under-specified.
- **Fix:** Explicitly define reference point sources: (1) user GPS location (default for mobile), (2) map center, (3) searched address coordinates, (4) user-clicked point. Document priority/selection rules.
- **Docs affected:** `features.md`, `use-cases.md` (UC1, UC2), `architecture.md`

### 11. No error handling contract for map or geocoding failures

- **Type:** UX / Reliability
- **Where:** `architecture.md` §3 has minimal handling — "never fail silently"
- **Problem:** What does the user see when: geocoding returns zero results? Map tiles fail to load? Supabase query times out? Network drops mid-session? The only spec is "display an explicit notice" for geocoding closest match. No loading states, error states, or retry strategies are documented anywhere.
- **Fix:** Add a UI state contract for every async operation: loading → success / empty / error states. Document retry policy for transient failures. M5 has this as an open TODO.
- **Docs affected:** `architecture.md`, `features.md`

### 12. RLS policies are conceptual, not implementation-ready

- **Type:** Security
- **Where:** `security-boundaries.md` §3
- **Problem:** Policies are described as "conceptual policy: SELECT a user can view images where user_id = auth.uid()." This is pseudo-code, not SQL. Engineers implementing this will make interpretation errors. The role-check subquery pattern is shown once but not applied consistently across all tables.
- **Fix:** Provide actual SQL for each policy, or at minimum, a precise policy-intent table with columns: table, operation, condition, role requirement. M4 has this as an open TODO.
- **Docs affected:** `security-boundaries.md`

### 13. No storage URL strategy (signed vs public, expiry)

- **Type:** Security / Performance
- **Where:** `security-boundaries.md` §4 says "MVP should default to signed URLs"
- **Problem:** Signed URLs expire. If a user has 50 thumbnails on screen and the signed URLs expire after 60 minutes, all thumbnails break simultaneously. The docs don't specify: URL TTL, refresh strategy, whether thumbnails could be public while full-res requires signing, or how URL generation scales (50 signed URLs = 50 signing operations).
- **Fix:** Document a tiered access strategy: thumbnails as public (they're low-res, minimal risk) and full-res as signed with defined TTL and refresh logic. Or use Supabase Storage's built-in auth integration.
- **Docs affected:** `security-boundaries.md`, `architecture.md`

### 14. `ClusterGroup` type is used but never defined

- **Type:** Architecture Gap
- **Where:** `architecture.md` §6 — `renderClusters(groups: ClusterGroup[])`
- **Problem:** The `MapAdapter` interface references `ClusterGroup[]` but this type is never defined anywhere. Engineers don't know what fields a cluster has (centroid lat/lng? count? bounding box? child marker handles?).
- **Fix:** Define the `ClusterGroup` interface alongside `MapAdapter`.
- **Docs affected:** `architecture.md`

### 15. No offline/poor-connectivity strategy for Technician persona

- **Type:** UX
- **Where:** `use-cases.md` Technician persona: "Connectivity: Intermittent"
- **Problem:** The Technician persona explicitly has "weak LTE, a Wi-Fi hotspot, or nothing at all." Yet offline mode is a declared non-goal and there is ZERO documentation about graceful degradation. What happens when connectivity drops mid-upload? Mid-map-pan? Does the user lose unsaved work?
- **Fix:** Offline mode is rightly excluded from MVP, but graceful degradation is not the same as offline mode. Document: (1) upload queue that retries on reconnect, (2) map tile caching for recent viewport, (3) clear "offline" indicator, (4) no silent data loss.
- **Docs affected:** `architecture.md`, `features.md`

### 16. Marker correction has no undo/confirmation UX specified

- **Type:** UX
- **Where:** `features.md` F8, `use-cases.md` UC3
- **Problem:** "User may drag marker to correct positional error." What if they drag it accidentally? What if they drag it to the wrong place? There's no undo, no confirmation dialog, and no undo history. Corrected coordinates are persisted immediately — a slip of the finger permanently changes the spatial index.
- **Fix:** Document: (1) drag preview with confirm/cancel before persisting, (2) "Reset to EXIF" action, (3) optional correction history log.
- **Docs affected:** `features.md`, `use-cases.md` (UC3)

### 17. No loading/empty/skeleton state specifications

- **Type:** UX
- **Where:** Across all docs
- **Problem:** What does the user see while images are loading? While the map is initializing? When a query returns zero results? When a filter combination has no matches? No shimmer states, skeleton screens, or empty-state messaging is specified. Poor loading UX is the #1 complaint for map-based applications.
- **Fix:** Define a loading state contract for: map init, viewport query, image detail load, upload progress, geocoding search, filter application. Each needs a loading, success, empty, and error state.
- **Docs affected:** `architecture.md`, `features.md`

### 18. Filter combination semantics undefined

- **Type:** Ambiguity
- **Where:** `features.md`, `decisions.md` D7
- **Problem:** D7 lists the MVP filters (time + project + metadata + distance) but never specifies how they combine. Are they AND or OR? If I select two projects, do I see images from project A AND project B, or project A OR project B? What about metadata filters — does "Material=Beton AND Material=Holz" return nothing (AND) or both (OR)?
- **Fix:** Define: (1) all filters are AND-combined (intersection). (2) Within a single filter category (e.g., projects), multiple selections are OR-combined (union). This is the standard faceted search model. M7 has this as open TODO.
- **Docs affected:** `features.md`, `decisions.md` (D7)

### 19. No image deletion flow documented

- **Type:** Feature Gap
- **Where:** Nowhere in features or use cases
- **Problem:** Users can upload images but there's no documented way to delete them (other than account deletion, which cascades). What if a user uploads the wrong image? The Technician persona would need this immediately. RLS policy for DELETE exists in `security-boundaries.md` but no feature or use case covers it.
- **Fix:** Add image deletion to features (with confirmation dialog), document cascade behavior (image_metadata, saved_group_images), and storage file cleanup.
- **Docs affected:** `features.md`, `use-cases.md`, `security-boundaries.md`

### 20. Project visibility/access model is un-specified

- **Type:** Security / Ambiguity
- **Where:** `security-boundaries.md` §3.4 — "read by authorized users, write by owner/admin according to product rules"
- **Problem:** Who can see a project? All users in the company? Only the creator? Only assigned users? "Authorized users" and "product rules" are circular references. There's no `project_members` table or any assignment mechanism. The `images` RLS policy is based on `user_id` (image owner), so a Clerk (UC2) reviewing another user's images in a shared project has no access path unless they're admin.
- **Fix:** This is the single biggest functional gap. Options: (1) all authenticated users can see all images (simple but coarse), (2) project-based access with a `project_members` table, (3) organization/company scoping. Must decide for MVP.
- **Docs affected:** `database-schema.md`, `security-boundaries.md`, `features.md`, `decisions.md` (new ADR)

---

## Tier 2 — High (Issues 21-50)

### 21. No `MapAdapter.onViewportChange()` event

- **Type:** Architecture Gap
- **Where:** `architecture.md` §6
- **Problem:** Viewport-bounded loading (F12) requires knowing when the viewport changes. The `MapAdapter` interface has no event for this.
- **Docs affected:** `architecture.md`

### 22. `MarkerOptions` and `MarkerHandle` types undefined

- **Type:** Architecture Gap
- **Where:** `architecture.md` §6
- **Problem:** `addMarker` accepts `MarkerOptions` and returns `MarkerHandle` — neither is defined.
- **Docs affected:** `architecture.md`

### 23. No batch metadata assignment

- **Type:** Feature Gap
- **Where:** `features.md` F18
- **Problem:** Metadata can be applied per image, but there's no documented way to assign metadata to multiple images at once — critical for a Technician who just uploaded 20 photos from one site.
- **Docs affected:** `features.md`, `use-cases.md`

### 24. `metadata_keys` uniqueness is "recommended" not enforced

- **Type:** Data Integrity
- **Where:** `database-schema.md` §7
- **Problem:** The unique constraint on `(created_by, key_name)` is described as "recommended." If not enforced, duplicate keys will proliferate and break filter UI.
- **Docs affected:** `database-schema.md`

### 25. No search/autocomplete strategy for metadata values

- **Type:** UX
- **Where:** `features.md` F18
- **Problem:** Metadata filtering requires knowing what values exist. With free-text values, users will create "Beton", "beton", "BETON", "concrete" for the same material. No normalization, autocomplete, or controlled vocabulary is specified.
- **Docs affected:** `features.md`, `architecture.md`

### 26. No project CRUD beyond creation

- **Type:** Feature Gap
- **Where:** `features.md` F16-17, `database-schema.md` §5
- **Problem:** Projects can be created (implied) but there's no documented UI or flow for editing project names, archiving projects, or deleting projects (ON DELETE SET NULL on images — is that desired UX?).
- **Docs affected:** `features.md`, `use-cases.md`

### 27. Account deletion cascades images — data loss risk

- **Type:** Data Integrity / UX
- **Where:** `user-lifecycle.md` §4, `database-schema.md` §6
- **Problem:** `ON DELETE CASCADE` on `images.user_id` means deleting a user destroys all their images. For a construction company's documentation, this could mean losing critical site records. There's no export-first-then-delete flow, no transfer-ownership option, and no soft-delete.
- **Docs affected:** `user-lifecycle.md`, `database-schema.md`, `features.md`

### 28. No audit trail for marker corrections

- **Type:** Data Integrity
- **Where:** `features.md` F8, `decisions.md` D4
- **Problem:** D4 says corrections are "additive, not destructive" — but only one set of corrected coordinates is stored. If a user corrects → corrects again → corrects again, only the latest correction survives. The history of corrections is lost. For construction documentation, knowing WHO moved a marker WHEN and from WHERE has legal/audit value.
- **Docs affected:** `database-schema.md` (correction history table), `features.md`, `decisions.md` (amend D4)

### 29. No image re-assignment between projects

- **Type:** Feature Gap
- **Where:** `features.md` F16
- **Problem:** Images can be assigned to one project, but there's no documented way to move an image to a different project or remove the project association.
- **Docs affected:** `features.md`

### 30. Time range filter lacks precision specification

- **Type:** Ambiguity
- **Where:** `features.md` F14
- **Problem:** "Time range filter limits displayed images." Day granularity? Hour? Does it use `captured_at` or `created_at`? What if `captured_at` is null — is the image excluded from time-filtered results or does it fall back to `created_at`?
- **Docs affected:** `features.md`, `decisions.md` (D7)

### 31. No Supabase rate limiting or query cost awareness

- **Type:** Performance / Scalability
- **Where:** Not documented
- **Problem:** Supabase free tier has connection limits and request rate limits. The docs never mention these constraints. A viewport-bounded query firing on every map pan (Issue #4) could hit rate limits quickly with even modest concurrent users.
- **Docs affected:** `architecture.md`, `setup-guide.md`

### 32. `direction_degrees` column is stored but never exposed in MVP

- **Type:** Waste / Clarity
- **Where:** `database-schema.md` §6, `features.md` non-goals
- **Problem:** The database stores `direction_degrees` and the glossary defines "Directional Relevance," but directional features are explicitly a non-goal. Storing data that won't be used in MVP is fine for future-proofing, but this should be clearly flagged to avoid engineers building dead features.
- **Docs affected:** `database-schema.md` (add note), `features.md` (clarify)

### 33. No multi-image detail view or gallery

- **Type:** Feature Gap / UX
- **Where:** `features.md` F15, `use-cases.md` UC1
- **Problem:** UC1 step 7: "Technician swipes or clicks through related images around the same spot." But F15 only specifies a single-image detail view. There's no documented gallery, carousel, or swipe-through behavior. This is a core interaction for the primary use case.
- **Docs affected:** `features.md`, `use-cases.md`

### 34. No documented keyboard navigation or accessibility

- **Type:** Accessibility
- **Where:** Across all docs
- **Problem:** Zero accessibility considerations. Map interactions, filter panel, image navigation — none have keyboard navigation specified. No mention of ARIA roles, screen reader support, or WCAG compliance level.
- **Docs affected:** `features.md`, `architecture.md`

### 35. Geocoding rate limiting not addressed

- **Type:** Performance
- **Where:** `architecture.md` §3, `decisions.md` D6
- **Problem:** Nominatim (the implied default) has strict rate limiting (1 request/second for the public instance). Address autocomplete typically fires on every keystroke. Without debounce and caching, GeoSite will be blocked by Nominatim almost immediately.
- **Docs affected:** `architecture.md`, `decisions.md` (D6)

### 36. No image format conversion pipeline

- **Type:** Performance
- **Where:** Not documented
- **Problem:** Modern phones shoot HEIC/HEIF. Older browsers don't render HEIC. The docs don't specify whether images should be converted to a web-friendly format (WebP, JPEG) on upload or whether format handling is the browser's problem.
- **Docs affected:** `architecture.md` (ingestion pipeline), `features.md`

### 37. `file_url` in images table — URL format undefined

- **Type:** Ambiguity
- **Where:** `database-schema.md` §6
- **Problem:** Is `file_url` a signed Supabase Storage URL (expires), a storage path (needs runtime URL generation), or a public URL? This fundamentally changes how the frontend loads images and how signed URL refresh works (Issue #13).
- **Docs affected:** `database-schema.md`, `architecture.md`

### 38. No documented map initial state

- **Type:** UX / Ambiguity
- **Where:** `architecture.md`, `features.md`
- **Problem:** When the user first opens the map, what do they see? Centered on their GPS? Centered on a default location (company HQ)? Showing all their images? A blank map? This first-load experience sets the tone for the entire product.
- **Docs affected:** `architecture.md`, `features.md`

### 39. Filter panel state persistence not addressed

- **Type:** UX
- **Where:** `features.md`, Clerk persona frustrations
- **Problem:** The Clerk persona explicitly calls out "Losing context (filter state, viewport position) when switching between images" as a frustration. Yet the docs don't specify whether filter state persists across sessions, on page refresh, or when navigating away from the map.
- **Docs affected:** `features.md`, `architecture.md`

### 40. No image count indicator when clusters are too dense

- **Type:** UX
- **Where:** `features.md` F13
- **Problem:** "Cluster dense regions to preserve readability and performance." But what information does the cluster show? A count badge? A color scale? When zoomed out to city level with 50,000 images in one cluster, how does the user know if it's worth zooming in?
- **Docs affected:** `features.md`

### 41. MapAdapter.destroy() lifecycle unclear

- **Type:** Architecture
- **Where:** `architecture.md` §6
- **Problem:** When is `destroy()` called? On Angular component destruction? On route change? What about in-flight queries when the map is destroyed? What about event listener cleanup? Leaky map instances are a common source of memory leaks in SPAs.
- **Docs affected:** `architecture.md`

### 42. No versioning or migration strategy for schema changes

- **Type:** Operations
- **Where:** `database-schema.md`
- **Problem:** The schema is described as a snapshot, but there's no mention of how schema changes are managed — Supabase migrations, raw SQL files, or a migration tool. The `supabase/` directory exists but only contains `config.toml`.
- **Docs affected:** `database-schema.md`, `setup-guide.md`

### 43. `ON DELETE RESTRICT` on `projects.created_by` blocks user deletion

- **Type:** Data Integrity / Operations
- **Where:** `database-schema.md` §5
- **Problem:** `projects.created_by` references `auth.users(id)` with `ON DELETE RESTRICT`. This means a user who created any project cannot be deleted from `auth.users` — contradicting the account deletion flow in `user-lifecycle.md` §4 which implies clean cascade.
- **Docs affected:** `database-schema.md`, `user-lifecycle.md`

### 44. `ON DELETE RESTRICT` on `metadata_keys.created_by` — same problem

- **Type:** Data Integrity / Operations
- **Where:** `database-schema.md` §7
- **Problem:** Same as #43 — `metadata_keys.created_by` ON DELETE RESTRICT blocks user deletion.
- **Docs affected:** `database-schema.md`, `user-lifecycle.md`

### 45. No real-time update mechanism documented

- **Type:** Feature Gap
- **Where:** Across docs
- **Problem:** If Technician A uploads images to a site and Clerk B is viewing that site simultaneously, Clerk B won't see the new images without a refresh. Supabase supports realtime subscriptions, but this isn't documented. For a multi-user system, stale data is a UX problem.
- **Docs affected:** `architecture.md`, `features.md`

### 46. No connection between search bar results and map navigation

- **Type:** UX
- **Where:** `architecture.md` §3, `features.md` F10
- **Problem:** Geocoding returns coordinates and the map centers on them. But in what state? Are existing filters preserved? Is a marker placed at the search result? What zoom level? If the user searches "Zürich" vs "Bahnhofstrasse 1, Zürich" they expect very different zoom levels.
- **Docs affected:** `architecture.md`, `features.md`

### 47. No image preview/crop before upload

- **Type:** UX
- **Where:** `features.md` F7
- **Problem:** F7 says "map preview before save" but there's no actual image preview — only a marker on the map. The user can't see the image itself before confirming upload. What if they selected the wrong file?
- **Docs affected:** `features.md`

### 48. EXIF parsing library not specified

- **Type:** Architecture
- **Where:** `architecture.md` §5
- **Problem:** EXIF parsing happens client-side (Angular), but no library is specified. Different libraries have different browser compatibility, HEIC support, and performance characteristics. This is a critical path item.
- **Docs affected:** `architecture.md`

### 49. No dark mode for the map tiles

- **Type:** UX / Theming
- **Where:** `architecture.md` §7
- **Problem:** The docs acknowledge that `setTileStyle('light' | 'dark')` may "no-op" if the provider doesn't support dark tiles. OSM's default tile server has no dark theme. This means dark mode will have a bright white map rectangle — the largest UI element — surrounded by dark UI. An alternative dark tile provider (e.g., CartoDB dark_matter, Stadia Alidade Smooth Dark) should be documented as the default dark tile set.
- **Docs affected:** `architecture.md` §7, `decisions.md` (D9)

### 50. Upload flow doesn't address duplicate detection

- **Type:** Data Integrity
- **Where:** `features.md` F5-F6, `architecture.md` §5
- **Problem:** If a user uploads the same photo twice (same EXIF data, same file), two records are created. Over time with thousands of uploads, duplicates accumulate. No deduplication by hash, EXIF timestamp+coordinates, or filename is mentioned.
- **Docs affected:** `features.md`, `architecture.md`, `database-schema.md`

---

## Tier 3 — Medium (Issues 51-80)

### 51. No `updated_at` column on any table

- **Type:** Data Integrity / Operations
- **Where:** `database-schema.md`
- **Problem:** No table has an `updated_at` timestamp. This makes cache invalidation, sync, and audit trails impossible. When was an image's coordinates corrected? When was a project renamed?
- **Docs affected:** `database-schema.md`

### 52. No soft-delete pattern for images

- **Type:** Data Integrity
- **Where:** `database-schema.md` §6
- **Problem:** `ON DELETE CASCADE` destroys images permanently. Construction documentation may have legal retention requirements. A `deleted_at` column enables soft-delete with grace period.
- **Docs affected:** `database-schema.md`, `features.md`

### 53. `latitude`/`longitude` as `numeric(9,6)` — precision sufficient?

- **Type:** Data Integrity
- **Where:** `database-schema.md` §6
- **Problem:** `numeric(9,6)` gives 6 decimal places (~0.11m precision). Sufficient for most use cases, but the column allows values up to ±999, which is invalid for latitude (max ±90). No CHECK constraint is documented.
- **Docs affected:** `database-schema.md`

### 54. No coordinate validation on insert

- **Type:** Data Integrity
- **Where:** `database-schema.md` §6
- **Problem:** Nothing prevents `latitude = 999` or `longitude = -999`. Add `CHECK (latitude BETWEEN -90 AND 90)` and `CHECK (longitude BETWEEN -180 AND 180)`.
- **Docs affected:** `database-schema.md`

### 55. No cascade behavior summary table

- **Type:** Doc Gap
- **Where:** `database-schema.md`
- **Problem:** Different tables use different FK behaviors (CASCADE, RESTRICT, SET NULL). A summary table showing all FK relationships and their delete behavior would prevent confusion (see Issues #43, #44).
- **Docs affected:** `database-schema.md`

### 56. `MapInitOptions` type undefined

- **Type:** Architecture Gap
- **Where:** `architecture.md` §6
- **Problem:** `init(container, options: MapInitOptions)` — type never defined. What options? Initial center? Zoom? Min/max zoom? Clustering config?
- **Docs affected:** `architecture.md`

### 57. Geocoding response type undefined

- **Type:** Architecture Gap
- **Where:** `architecture.md` §3
- **Problem:** The geocoding boundary is described as provider-agnostic but no TypeScript interface is provided (unlike `ImageInputAdapter` and `MapAdapter` which have full interfaces).
- **Docs affected:** `architecture.md`

### 58. No multi-select for project filter

- **Type:** UX
- **Where:** `features.md` F17
- **Problem:** F17 says "filter images by one or more projects" but the filter panel description only shows a single filter panel. Multi-select UI pattern (checkboxes, chips, or multi-select dropdown) isn't specified.
- **Docs affected:** `features.md`

### 59. `profiles.company` has no normalization

- **Type:** Data Integrity
- **Where:** `database-schema.md` §2
- **Problem:** `company` is free text. If the intended model is multi-company or company-scoped data, free text won't work for grouping. If it's just display, it's fine — but the intended use should be clarified.
- **Docs affected:** `database-schema.md`

### 60. No session expiry or token refresh documentation

- **Type:** Security
- **Where:** `user-lifecycle.md` §2
- **Problem:** "Angular stores the session." How long does the JWT live? What's the refresh strategy? Supabase JWTs default to 1 hour. If the Technician is in the field for 4 hours, their session may expire silently.
- **Docs affected:** `user-lifecycle.md`, `security-boundaries.md`

### 61. Password requirements not specified

- **Type:** Security
- **Where:** `user-lifecycle.md`, `features.md` F1
- **Problem:** Supabase Auth has configurable password requirements, but the docs don't specify minimum length, complexity, or whether brute-force protection is enabled.
- **Docs affected:** `security-boundaries.md`

### 62. No password reset flow documented

- **Type:** Feature Gap
- **Where:** `user-lifecycle.md`
- **Problem:** Registration, login, and deletion are documented. Password reset (forgot password) is not.
- **Docs affected:** `user-lifecycle.md`, `features.md`

### 63. Sidebar navigation items undefined

- **Type:** UX
- **Where:** `architecture.md` §1 mentions "left sidebar for navigation (e.g., Map / Projects / Admin / …)"
- **Problem:** The sidebar items are listed with "…" — unclear what the full navigation structure is. Is there a profile page? Settings? Help?
- **Docs affected:** `architecture.md`, `features.md`

### 64. Admin UI is unspecified

- **Type:** Feature Gap
- **Where:** `use-cases.md` UC4
- **Problem:** UC4 says "navigates to a user management view (or uses SQL/console in early phases)." The parenthetical escape clause means there's no actual admin UI specification. For MVP, is the admin expected to use Supabase dashboard? That should be explicit, not implied.
- **Docs affected:** `features.md`, `use-cases.md`

### 65. No user list/search for admin

- **Type:** Feature Gap
- **Where:** `use-cases.md` UC4
- **Problem:** How does the admin find a user to modify? By email? By name? There's no user search or list feature documented.
- **Docs affected:** `features.md`

### 66. Registration trigger idempotency requirement is aspirational

- **Type:** Data Integrity
- **Where:** `user-lifecycle.md` §1
- **Problem:** "Trigger logic must avoid duplicate profiles/user_roles rows if retried." This is a requirement, not an implementation — and PostgreSQL triggers are tricky to make idempotent. Should use `ON CONFLICT DO NOTHING` or guard with `IF NOT EXISTS`.
- **Docs affected:** `user-lifecycle.md`

### 67. No index on `images.user_id`

- **Type:** Performance
- **Where:** `database-schema.md` §8
- **Problem:** RLS policies check `user_id = auth.uid()` on every query. Without an index on `user_id`, this check becomes a sequential scan on the `images` table. The index strategy section doesn't list it.
- **Docs affected:** `database-schema.md`

### 68. No index on `images.project_id` alone

- **Type:** Performance
- **Where:** `database-schema.md` §8
- **Problem:** Composite index on `(project_id, created_at desc)` exists, but filtering by project without a time range won't efficiently use it on all query planners. A standalone `project_id` index may be needed for project listing/counts.
- **Docs affected:** `database-schema.md`

### 69. No documentation on Supabase Storage bucket structure

- **Type:** Architecture Gap
- **Where:** `security-boundaries.md` §4
- **Problem:** "User-scoped upload paths" — but what's the actual bucket/path structure? `{bucket}/{user_id}/{uuid}.jpg`? One bucket or multiple? This affects RLS policies for storage.
- **Docs affected:** `security-boundaries.md`, `architecture.md`

### 70. ThemeService localStorage key not specified

- **Type:** Minor Architecture
- **Where:** `architecture.md` §7
- **Problem:** `ThemeService` persists to `localStorage` but the key name isn't specified. If an engineer picks `theme` and another picks `geosite-theme`, it won't sync.
- **Docs affected:** `architecture.md`

### 71. No export feature documented

- **Type:** Feature Gap
- **Where:** `use-cases.md` UC2 step 8: "exports or notes relevant findings"
- **Problem:** UC2 mentions export but no export feature exists in `features.md`. What format? PDF report? CSV? Raw image download? ZIP?
- **Docs affected:** `features.md`, `use-cases.md`

### 72. `viewer` role permissions undefined

- **Type:** Security
- **Where:** `security-boundaries.md`, `glossary.md`
- **Problem:** Three roles exist: `admin`, `user`, `viewer`. RLS policies only differentiate between "own data" and "admin." The `viewer` role has no distinct permission set. Can viewers upload? Can they correct markers? If viewer = read-only, that must be explicit.
- **Docs affected:** `security-boundaries.md`, `features.md`

### 73. No loading priority for thumbnail vs map tile

- **Type:** Performance
- **Where:** Not documented
- **Problem:** On a slow connection (Technician persona), map tiles and image thumbnails compete for bandwidth. No priority scheme is documented. Map tiles should load first (navigation context), then thumbnails.
- **Docs affected:** `architecture.md`

### 74. Cluster ordering inside a detail view undefined

- **Type:** UX
- **Where:** `decisions.md` D7
- **Problem:** D7 defines ordering when clicking a cluster (distance asc, then timestamp desc). But what does the detail view show? A list? A grid? Pagination within the cluster? What if the cluster has 500 images?
- **Docs affected:** `features.md`, `decisions.md`

### 75. No text search across image metadata

- **Type:** Feature Gap
- **Where:** `features.md` F18
- **Problem:** Metadata filtering is by key/value exact match. There's no full-text search across metadata values, image notes, or project names. Clerks searching for "Beton" should find it in any metadata field.
- **Docs affected:** `features.md`

### 76. Angular state management pattern unspecified

- **Type:** Architecture
- **Where:** `architecture.md`
- **Problem:** No mention of state management approach. Plain services? NgRx? Signals? For a map-first app with filters, selection state, open images, and user state, this will become a maintenance problem quickly.
- **Docs affected:** `architecture.md`, `decisions.md`

### 77. No testing strategy documented

- **Type:** Quality
- **Where:** Across docs
- **Problem:** `tsconfig.spec.json` and `app.spec.ts` exist, but no testing strategy is documented. What's the unit test target? Integration tests for RLS? E2E for upload flow? How do you test map interactions?
- **Docs affected:** `setup-guide.md`, `architecture.md`

### 78. Leaflet CSS/performance bundle impact not addressed

- **Type:** Performance
- **Where:** `architecture.md`
- **Problem:** Leaflet + leaflet.markercluster + tile layers add significant JS/CSS to the initial bundle. No mention of lazy loading the map component, code-splitting, or deferring Leaflet until the map route is active.
- **Docs affected:** `architecture.md`

### 79. No image compression on upload

- **Type:** Performance / Cost
- **Where:** `architecture.md` §5
- **Problem:** Raw phone photos can be 5-15MB each. No client-side compression before upload is documented. This wastes bandwidth (Technician on LTE) and storage costs. Client-side resize to max 4096px before upload is a common optimization.
- **Docs affected:** `architecture.md`, `features.md`

### 80. HEIC/HEIF EXIF parsing may fail silently

- **Type:** Data Integrity
- **Where:** `features.md` F6
- **Problem:** HEIC files store EXIF differently than JPEG. Many JS EXIF libs don't support HEIC. If EXIF parsing fails silently, the image will have no coordinates — bouncing to the undefined fallback (Issue #6).
- **Docs affected:** `architecture.md`, `features.md`

---

## Tier 4 — Low / Cosmetic (Issues 81-100)

### 81. Glossary doesn't include "viewport" or "bounding box"

- **Type:** Doc Gap
- **Where:** `glossary.md`
- **Problem:** These are used repeatedly but never defined.
- **Docs affected:** `glossary.md`

### 82. Glossary doesn't include "cluster"

- **Type:** Doc Gap
- **Where:** `glossary.md`
- **Problem:** Marker clustering is an MVP feature but isn't defined.
- **Docs affected:** `glossary.md`

### 83. Glossary doesn't include "thumbnail"

- **Type:** Doc Gap
- **Where:** `glossary.md`
- **Problem:** Used across docs without definition or size specification.
- **Docs affected:** `glossary.md`

### 84. `features.md` feature IDs skip implicit numbering

- **Type:** Doc Consistency
- **Where:** `features.md`
- **Problem:** Features are numbered 1-25 but the mapping table references "Feature IDs" without explicit ID anchors in the text. If features are added mid-list, all IDs shift.
- **Docs affected:** `features.md`

### 85. No versioning of docs themselves

- **Type:** Process
- **Where:** Across docs
- **Problem:** Docs have no version markers, change dates, or changelog. When was the schema last updated? Is this the current architecture or a stale draft?
- **Docs affected:** All docs

### 86. `decisions.md` numbering is sequential but may gap

- **Type:** Doc Consistency
- **Where:** `decisions.md`
- **Problem:** D1-D10 exist. New decisions might be D11, D12, etc. If a decision is retired, numbers gap. Consider immutable IDs.
- **Docs affected:** `decisions.md`

### 87. Setup guide doesn't mention PostGIS enablement

- **Type:** Doc Gap
- **Where:** `setup-guide.md`
- **Problem:** If PostGIS becomes MVP (Issue #1), the setup guide must include `CREATE EXTENSION postgis`.
- **Docs affected:** `setup-guide.md`

### 88. No documentation on Supabase project configuration

- **Type:** Doc Gap
- **Where:** `setup-guide.md`
- **Problem:** Beyond environment variables, no guidance on Supabase dashboard settings (auth providers, email templates, storage config).
- **Docs affected:** `setup-guide.md`

### 89. CSS custom properties in architecture doc use Tailwind `theme()` function

- **Type:** Accuracy
- **Where:** `architecture.md` §7
- **Problem:** `--color-primary: theme("colors.blue.600")` in a CSS block — `theme()` is a Tailwind compile-time function, not valid in runtime CSS custom property declarations. This would need to be the actual resolved value or use `@apply`.
- **Docs affected:** `architecture.md`

### 90. No `robots.txt` or SEO consideration

- **Type:** Minor
- **Where:** Not documented
- **Problem:** SPA needs proper meta tags and `robots.txt` to prevent indexing of authenticated content. Minor for an internal tool, but worth a line.
- **Docs affected:** `setup-guide.md`

### 91. No CI/CD or deployment documentation

- **Type:** Operations
- **Where:** Not documented
- **Problem:** No mention of how the Angular app is built, deployed, or hosted. Supabase edge functions? Vercel? Netlify? Self-hosted?
- **Docs affected:** `setup-guide.md`

### 92. `app.routes.ts` is empty — no route structure documented

- **Type:** Architecture Gap
- **Where:** Source code, `architecture.md`
- **Problem:** No route structure is documented or implemented. For a map-first app with admin views, the route tree matters for code splitting.
- **Docs affected:** `architecture.md`

### 93. `package.json` at root is a monorepo wrapper but structure unclear

- **Type:** Doc Gap
- **Where:** `setup-guide.md`
- **Problem:** There's a root `package.json` and `apps/web/package.json`. The monorepo tool (nx? turborepo? npm workspaces?) isn't documented.
- **Docs affected:** `setup-guide.md`

### 94. No internationalization (i18n) consideration

- **Type:** Feature Gap
- **Where:** Not documented
- **Problem:** Product seems targeted at German-speaking construction companies (metadata examples: "Fang", "Türe", "Beton"). If i18n is needed, it should be flagged now; if not, declare it out of scope.
- **Docs affected:** `features.md` (non-goals)

### 95. `security-boundaries.md` has no mention of CORS

- **Type:** Security
- **Where:** `security-boundaries.md`
- **Problem:** SPA + Supabase requires proper CORS configuration. Not mentioned.
- **Docs affected:** `security-boundaries.md`, `setup-guide.md`

### 96. No rate limiting on client-side actions

- **Type:** Security
- **Where:** `security-boundaries.md`
- **Problem:** What prevents a user from uploading 10,000 images programmatically? Client-side rate limiting is untrusted, but Supabase-side limits should be documented.
- **Docs affected:** `security-boundaries.md`

### 97. Milestones M2-M7 TODOs are all unchecked

- **Type:** Process
- **Where:** `milestones.md`
- **Problem:** Only M1 is complete. All other milestones have zero completed TODOs. This is a progress tracking observation, not a doc defect — but highlights that much of the documented architecture is not yet validated.
- **Docs affected:** `milestones.md`

### 98. `supabase/config.toml` contents not documented

- **Type:** Doc Gap
- **Where:** `setup-guide.md`
- **Problem:** The Supabase config file exists but there's no guidance on what should be in it vs. what's configured via dashboard.
- **Docs affected:** `setup-guide.md`

### 99. No documentation on browser support targets

- **Type:** Architecture
- **Where:** Not documented
- **Problem:** Does this need to work on Safari iOS 14? Chrome Android? IE is presumably dead. Browser targets affect HEIC support, WebP, and modern JS feature usage.
- **Docs affected:** `architecture.md` or `features.md`

### 100. Missing cross-references between docs

- **Type:** Doc Consistency
- **Where:** Various
- **Problem:** Some docs reference each other well (e.g., "See decisions.md D3"), but others miss connections. For example, `user-lifecycle.md` doesn't reference `milestones.md` M2, and `database-schema.md` doesn't reference the cascade conflicts with `user-lifecycle.md`.
- **Docs affected:** All docs (add cross-reference audit)

---

## Summary: Top 10 Actions by Impact

| Priority | Action                                                                 | Issues                 | Docs to Change                                            |
| -------- | ---------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| 1        | Promote PostGIS + GiST to MVP default; document server-side clustering | #1, #3, #4             | database-schema, architecture, decisions                  |
| 2        | Define project visibility/access model — this blocks Clerk use case    | #20                    | database-schema, security-boundaries, features, decisions |
| 3        | Document thumbnail generation pipeline and progressive loading         | #2, #13, #73           | database-schema, architecture, features                   |
| 4        | Add responsive layout contract and mobile bottom-sheet pattern         | #9, Concern 3          | architecture, features                                    |
| 5        | Specify EXIF fallback path for GPS-less images                         | #6, #80                | features, use-cases, architecture                         |
| 6        | Complete `MapAdapter` interface (viewport events, cluster types)       | #5, #14, #21, #22, #56 | architecture                                              |
| 7        | Define filter combination semantics and pagination contract            | #18, #3, #30           | features, decisions                                       |
| 8        | Document upload validation, concurrency, and error handling            | #7, #8, #11, #17       | architecture, features                                    |
| 9        | Define spatial selection interaction pattern                           | Concern 2              | features, use-cases, architecture                         |
| 10       | Fix FK cascade conflicts (RESTRICT vs CASCADE)                         | #43, #44, #27          | database-schema, user-lifecycle                           |
