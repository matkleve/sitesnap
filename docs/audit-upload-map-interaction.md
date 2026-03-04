# Upload, Map Interaction & Direction UX Audit

**Date:** 2026-03-04  
**Scope:** Upload pipeline, map placement, marker interaction, direction/bearing UX, drag-to-map, and related cross-cutting concerns.  
**Goal:** 100 ideas and issues across the upload → map interaction surface. Ranked by impact tier. Follows the same format as `audit.md`.

---

## Table of Contents

- [Part A — Deep-Dive: Three Key Interaction Patterns](#part-a--deep-dive-three-key-interaction-patterns)
  - [Pattern 1: Drag-from-Panel-to-Map Placement](#pattern-1-drag-from-panel-to-map-placement)
  - [Pattern 2: Direction Cone Visualization & Editing](#pattern-2-direction-cone-visualization--editing)
  - [Pattern 3: Post-Upload Marker Lifecycle](#pattern-3-post-upload-marker-lifecycle)
- [Part B — Full Issue Registry (100 Issues)](#part-b--full-issue-registry-100-issues)
  - [Tier 1 — Critical (Issues 1–20)](#tier-1--critical-issues-1-20)
  - [Tier 2 — High (Issues 21–50)](#tier-2--high-issues-21-50)
  - [Tier 3 — Medium (Issues 51–80)](#tier-3--medium-issues-51-80)
  - [Tier 4 — Low / Nice-to-Have (Issues 81–100)](#tier-4--low--nice-to-have-issues-81-100)

---

# Part A — Deep-Dive: Three Key Interaction Patterns

---

## Pattern 1: Drag-from-Panel-to-Map Placement

### Current State

Images without EXIF GPS data enter `awaiting_placement` in the upload panel. The user must click "📍 Place on map" text (now wired to trigger placement mode), then click the map. A blue "Click the map to place the image" banner appears at the top. The map cursor changes to crosshair.

### Proposed Enhancement: Direct Drag-to-Map

Instead of a two-step "click text → click map" flow, the user should be able to **drag the awaiting_placement thumbnail directly from the panel onto the map**. On drop, the image is placed at the drop location.

#### Interaction Flow

1. **Panel shows a draggable thumbnail** for `awaiting_placement` files. The thumbnail has a subtle drag handle (grip dots) and the cursor changes to `grab` on hover.
2. **User starts dragging** — the thumbnail lifts with a `transform: scale(0.8)` and reduced opacity. A drag ghost (HTML5 Drag API or pointer-events-based custom drag) follows the cursor.
3. **Drag enters the map area** — the map shows a crosshair + drop target indicator (pulsing circle at the projected drop position). The upload panel fades slightly to reduce visual noise.
4. **User drops on the map** — smooth animation: the drag ghost morphs from the rectangular thumbnail into the circular Leaflet marker icon over 300ms (scale down + border-radius transition). Coordinates are extracted from the Leaflet map projection (`containerPointToLatLng`).
5. **Upload begins** — the `placeFile()` pipeline runs with the drop coordinates. Marker appears immediately with a spinner overlay while the upload completes.
6. **Cancel**: pressing Escape during drag or dropping outside the map cancels placement.

#### Technical Considerations

- **HTML5 Drag API vs. Pointer Events:** HTML5 Drag API is simpler for cross-element drag but the drag image is not customizable mid-drag. A pointer-events-based approach (tracking `pointerdown` → `pointermove` → `pointerup`) gives full control over the ghost element and enables the smooth rectangle-to-marker animation.
- **Leaflet event passthrough:** During drag, Leaflet's own drag panning must be disabled. Use `map.dragging.disable()` on drag start and re-enable on drop/cancel.
- **Touch support:** Pointer events work on mobile. Long-press (300ms) on the thumbnail enters drag mode on touch.
- **Multiple awaiting files:** If multiple files lack GPS, each must be dragged individually. The panel should show a numbered badge ("1 of 3 to place").

#### Animation: Rectangle-to-Marker Morph

```
Drag start          Mid-drag (over map)       Drop (300ms transition)
┌──────────┐       ┌──────────┐               ●  ← Leaflet marker
│  photo   │  →    │  photo   │  →            ↑
│ thumbnail│       │  (0.8x)  │          border-radius: 50%
└──────────┘       └──────────┘          scale: 0.4 → marker size
```

The ghost element transitions:

- `border-radius`: 4px → 50%
- `width/height`: thumbnail size → 25×41 (Leaflet default icon)
- `opacity`: 0.85 → 1.0
- `box-shadow`: spreads outward = "landing" effect

#### Doc Changes Required

- `features.md` §1.2: Add drag-to-map placement as an interaction for images without GPS.
- `architecture.md`: Document the pointer-events-based drag manager and Leaflet integration.
- `decisions.md`: New ADR for pointer-events vs. HTML5 Drag API trade-off.

---

## Pattern 2: Direction Cone Visualization & Editing

### Current State

The `images` table has a `direction numeric(5,2)` column with a `CHECK(direction BETWEEN 0 AND 360)` constraint. `parseExif()` now extracts `GPSImgDirection` and persists it. But the direction is never **displayed** or **editable** in the UI. Decision D7 says: "Directional relevance remains a post-MVP enhancement; bearing is stored but not yet exposed to users."

### Proposed Enhancement: Interactive Direction Cone on Markers

Each marker that has direction data shows a subtle **direction indicator** on hover. When hovered, a 30° cone (field-of-view wedge) fans out from the marker in the bearing direction.

#### Interaction Flow

1. **Marker at rest** — standard Leaflet marker icon. A tiny compass arrow (CSS `::after` pseudo-element, 6px) beside the marker hints that direction data exists. Markers without direction show no arrow.
2. **Hover / tap on marker** — a translucent wedge (SVG overlay or L.Polygon) appears: vertex at the marker location, extending outward 50–100px (screen space, not geo distance). Cone angle: 30° centered on the bearing value. Color: semi-transparent blue (`rgba(37, 99, 235, 0.2)`) with a 1px border.
3. **Cone follows zoom** — the wedge length is constant in screen pixels (not meters) so it reads well at any zoom level. Alternatively, make it geo-referenced (e.g., 50m) for surveyors who need real-world scale.
4. **Editing: drag the cone tip** — the far end of the cone has a drag handle (small circle, 8px). Dragging it rotates the cone around the marker, updating the `direction` value live. A tooltip shows the current bearing (e.g., "127.5°").
5. **Save on release** — on `pointerup`, the new direction is persisted via an `UPDATE images SET direction = :new_direction WHERE id = :id` call. Optimistic UI: the cone updates immediately; a red flash on the handle indicates save failure.
6. **Keyboard accessible** — when a marker is focused, arrow keys rotate the cone by 5° increments (shift+arrow = 1°).

#### Visual Design

```
         ╱ 30° cone ╲
        ╱             ╲
       ╱       ●        ╲         ← drag handle at tip
      ╱     (bearing)     ╲
     ╱                     ╲
    ●──────────────────────  ← marker
```

The cone vertex is at the marker. The opening angle is 30° (representing a typical camera FOV). The direction of the bisector is the `GPSImgDirection` value.

#### Leaflet Implementation

- **Option A: L.SemiCircle plugin** — draws arc-shaped polygons. Lightweight, well-supported.
- **Option B: Custom L.SVGOverlay** — project cone vertices with `map.latLngToLayerPoint()`, render as an SVG `<polygon>`. Full control over styling and animation.
- **Option C: CSS-only on the marker** — a rotated `conic-gradient` on a `::after` pseudo-element. Zero Leaflet plugin deps, but limited to screen-space (no geo projection).

**Recommended:** Option B (custom SVG overlay) for maximum flexibility and clean geo-projection.

#### Direction Editing Data Flow

```
pointer drag → compute angle from marker → update signal → optimistic render
                                           ↓
                                    debounce 500ms → PATCH to Supabase
                                           ↓
                                    success: silent  /  failure: red flash + retry
```

#### Doc Changes Required

- `features.md` §2 item 7: Promote "directional relevance" from post-MVP to MVP UI.
- `decisions.md` D7: Update to reflect direction is now exposed in MVP.
- `architecture.md`: Document the direction cone rendering contract (hover behavior, cone geometry, save flow).

---

## Pattern 3: Post-Upload Marker Lifecycle

### Current State

After upload with GPS, `onImageUploaded()` adds a Leaflet marker with a generic popup showing the image ID. There is no thumbnail preview, no direction indicator, no edit affordance, and no connection back to the upload panel or workspace.

### Proposed Enhancement: Rich Marker with Lifecycle States

A marker should evolve through a lifecycle:

1. **Fresh upload (0–5s)** — marker has a green "pulse" animation (CSS ring that expands and fades). Draws the user's eye to the newly placed image.
2. **Normal state** — standard marker icon with optional direction mini-arrow.
3. **Hover** — enlarged marker + direction cone (if direction data). Popup shows: thumbnail (signed URL), filename, capture date, distance from map center.
4. **Selected** — marker outline glows blue. Image appears in the Active Selection tab.
5. **Editing** — marker is draggable (coordinate correction, not in MVP but the marker should support it). Direction cone handle is visible.
6. **Error** — red marker with exclamation icon for failed uploads that were rolled back.

This lifecycle ensures continuity from upload → placement → exploration → editing.

#### Doc Changes Required

- `architecture.md` §6: Extend `MapAdapter` with marker lifecycle states and event contracts.
- `features.md` §1.2 item 7: Expand "Map preview before save" to cover the full lifecycle.

---

# Part B — Full Issue Registry (100 Issues)

Format: `ID | Category | Description | Impact | Files affected`

---

## Tier 1 — Critical (Issues 1–20)

Issues that block core workflows or cause data loss / confusion.

| #   | Category               | Description                                                                                                                                                                          | Impact                                                                          | Files                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **Bug — Fixed**        | `enterPlacementMode()` was never called; "Place on map" did nothing for no-GPS images.                                                                                               | Blocker for manual coordinate input.                                            | `map-shell.component.ts/html`, `upload-panel.component.ts` |
| 2   | **Bug — Fixed**        | `parseExif()` did not extract `GPSImgDirection`; direction column always stored NULL.                                                                                                | Core data loss — bearing from camera never persisted.                           | `upload.service.ts`                                        |
| 3   | **Missing feature**    | No visual feedback when placement mode is active. User has no idea the cursor changed or what to do next. **Fixed:** Banner + crosshair cursor now appear.                           | Usability dead-end for placement flow.                                          | `map-shell.component.html/scss`                            |
| 4   | **Missing feature**    | No cancel button for placement mode. If the user changes their mind they must reload. **Fixed:** Cancel button on the banner.                                                        | UX trap — no escape hatch.                                                      | `map-shell.component.ts/html`                              |
| 5   | **Missing flow**       | After manual placement + upload completes, the marker is added but the panel item stays in `awaiting_placement` state visually (no transition shown).                                | Confusing state mismatch.                                                       | `upload-panel.component.ts`                                |
| 6   | **Missing validation** | Placement mode allows clicking anywhere, including the ocean or uninhabited areas. No confirmation "Are you sure this is correct?" for extreme coordinates.                          | Accidental bad data entry.                                                      | `map-shell.component.ts`                                   |
| 7   | **Missing feedback**   | When upload fails mid-pipeline (after storage upload but before DB insert), the storage file is orphaned. No cleanup retry.                                                          | Silent data waste in storage.                                                   | `upload.service.ts`                                        |
| 8   | **Missing feature**    | No retry button for failed uploads. Users must re-drop or re-select the file.                                                                                                        | Frustrating for intermittent network.                                           | `upload-panel.component.html/ts`                           |
| 9   | **Data integrity**     | `uploadFile()` parses EXIF a second time (once in `processFile()`, once in `uploadFile()`). Wastes CPU and could return different results if the file is large + memory-constrained. | Performance + subtle inconsistency risk.                                        | `upload.service.ts`, `upload-panel.component.ts`           |
| 10  | **Missing feature**    | No thumbnail preview in the upload panel file list. Users see only filename + status text.                                                                                           | Low confidence — "did I upload the right photo?"                                | `upload-panel.component.html/scss`                         |
| 11  | **Missing feature**    | No drag-to-map placement. Current flow requires click-in-panel → click-on-map (two disjointed actions).                                                                              | Non-intuitive for spatial placement.                                            | `upload-panel.component.ts`, `map-shell.component.ts`      |
| 12  | **Missing feature**    | Direction data is persisted but never displayed on the map. Users can't see or validate bearing.                                                                                     | Stored data has no UI surface.                                                  | `map-shell.component.ts`                                   |
| 13  | **Missing flow**       | Multiple `awaiting_placement` files: clicking the map places only the first one. No queue indicator ("1 of 3 to place").                                                             | Confusing when batch-uploading no-GPS images.                                   | `upload-panel.component.ts`, `map-shell.component.ts`      |
| 14  | **Missing feedback**   | No animation or visual confirmation when a marker is placed on the map after upload. It just appears.                                                                                | User misses the result, especially on a busy map.                               | `map-shell.component.ts`                                   |
| 15  | **Accessibility**      | Placement mode has no screen reader announcement. The banner is `role="status"` (good) but there's no `aria-live` region for the crosshair mode activation.                          | Screen reader users unaware of mode change.                                     | `map-shell.component.html`                                 |
| 16  | **Missing feature**    | No undo for placement. Once the user clicks the map, the image gets uploaded at those coordinates with no way to move it.                                                            | Coordinate correction is deferred but undo should exist for immediate mistakes. | `map-shell.component.ts`                                   |
| 17  | **Missing flow**       | Panel doesn't scroll to the `awaiting_placement` item when placement mode activates. If the list is long, the user can't see which file they're placing.                             | Lost context in long upload queues.                                             | `upload-panel.component.ts/html`                           |
| 18  | **Missing validation** | No dimension validation (min 100×100, max 8192×8192 per features.md §1.9 item 30). `validateFile()` only checks size and MIME.                                                       | Violates the stated spec. Tiny/huge images slip through.                        | `upload.service.ts`                                        |
| 19  | **Missing feature**    | No HEIC/HEIF client-side conversion (features.md §1.9 item 32). HEIC files are accepted but may not display in browsers that lack HEIC support.                                      | Feature spec gap — HEIC accepted but not converted.                             | `upload.service.ts`                                        |
| 20  | **Missing feature**    | No client-side image compression for images > 4096px (features.md §1.9 item 33). Large originals are uploaded raw.                                                                   | Bandwidth waste + slow upload for high-res photos.                              | `upload.service.ts`                                        |

---

## Tier 2 — High (Issues 21–50)

Significant UX improvements and spec compliance issues.

| #   | Category         | Description                                                                                                                                                                                                                | Impact                                                           | Files                                                   |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 21  | **UX**           | The upload panel has no thumbnail generator. Creating browser-side `ObjectURL` thumbnails for each file would give instant visual feedback.                                                                                | Users can't visually identify files in the queue.                | `upload-panel.component.ts/html`                        |
| 22  | **UX**           | Placement banner should show the filename being placed ("📍 Place photo_001.jpg on the map").                                                                                                                              | Context when placing from a batch.                               | `map-shell.component.html/ts`                           |
| 23  | **UX**           | No progress indication during EXIF parsing phase. "Reading EXIF…" text has no spinner or animation.                                                                                                                        | Feels frozen on large files.                                     | `upload-panel.component.html/scss`                      |
| 24  | **UX**           | The direction cone (Pattern 2) should be editable for manually-placed images too. If a user knows the bearing, they should be able to set it post-placement.                                                               | Direction data only available from EXIF. Manual entry needed.    | `map-shell.component.ts`                                |
| 25  | **UX**           | No keyboard shortcut for toggling the upload panel.                                                                                                                                                                        | Power users want `U` or `Ctrl+U` to open/close.                  | `map-shell.component.ts`                                |
| 26  | **UX**           | The panel overlays the map but doesn't pause map interactions. Clicks intended for the panel might leak through to the map.                                                                                                | Accidental marker placement while interacting with panel.        | `upload-panel.component.scss`, `map-shell.component.ts` |
| 27  | **UX**           | No batch progress summary (e.g., "3/5 uploaded"). Only individual file statuses.                                                                                                                                           | No aggregate view for bulk uploads.                              | `upload-panel.component.html/ts`                        |
| 28  | **UX**           | Drop zone occupies the full panel but is small. Should expand to accept drops on the entire map area (with visual indicator) when the upload panel is open.                                                                | Narrow drop target frustrates users dragging from file explorer. | `map-shell.component.html/ts`                           |
| 29  | **UX**           | The `complete` state badge shows "✓ Done" but no coordinates or link to the marker on the map.                                                                                                                             | Disconnect between panel and map.                                | `upload-panel.component.html`                           |
| 30  | **UX**           | No "click to center on marker" in the panel. After upload, users must manually pan the map to find the new marker.                                                                                                         | Lost marker in large map view.                                   | `upload-panel.component.ts`, `map-shell.component.ts`   |
| 31  | **UX**           | The `awaiting_placement` text says "click the map" but doesn't mention the new drag-to-map capability.                                                                                                                     | Copy doesn't match the interaction model.                        | `upload-panel.component.html`                           |
| 32  | **Performance**  | `crypto.randomUUID()` is called during `enqueueFiles()` which runs on the main thread. For 50+ files this is fine, but the entire enqueue loop is synchronous. Consider yielding to the event loop for very large batches. | Main thread block for 100+ file drops.                           | `upload-panel.component.ts`                             |
| 33  | **UX**           | No duplicate file detection. Dropping the same file twice creates two separate entries.                                                                                                                                    | Accidental duplicates waste storage.                             | `upload-panel.component.ts`, `upload.service.ts`        |
| 34  | **UX**           | Marker popup shows only `Image uploaded (id: <uuid>)`. Should show thumbnail + metadata.                                                                                                                                   | Markers are information-free.                                    | `map-shell.component.ts`                                |
| 35  | **UX**           | No marker clustering integration with uploads. At zoom levels where clustering is active, newly uploaded images should join the cluster, not create orphan markers.                                                        | Visual inconsistency when clustering is implemented.             | `map-shell.component.ts`                                |
| 36  | **UX**           | Panel `overflow-y: auto` but no visual scroll indicator. Users may not notice there are more files below the fold.                                                                                                         | Hidden files in long queues.                                     | `upload-panel.component.scss`                           |
| 37  | **UX**           | Direction cone rotation during editing should snap to cardinal/intercardinal directions (N/NE/E/SE etc.) when within ±5° — like Figma's rotation snapping.                                                                 | Precision vs. convenience for common bearings.                   | (new) `direction-editor.component.ts`                   |
| 38  | **UX**           | No visual indicator of EXIF data richness per file. A small icon set (📍 has GPS, 🧭 has direction, 📅 has date, ⚠️ missing) would help users triage files quickly.                                                        | Opaque metadata status in the queue.                             | `upload-panel.component.html`                           |
| 39  | **Architecture** | The `imageUploaded` output emits `{id, lat, lng}` but not `direction`. The marker renderer can't show the direction cone without a second data fetch.                                                                      | Missing data in the event contract.                              | `upload-panel.component.ts`, `map-shell.component.ts`   |
| 40  | **UX**           | No confirmation toast or sound when an upload completes. The status badge changes silently.                                                                                                                                | Easy to miss completion in peripheral vision.                    | `upload-panel.component.ts`                             |
| 41  | **Architecture** | `doUpload()` catches errors but doesn't distinguish between network errors (retryable) and auth errors (not retryable). Retry logic needs error classification.                                                            | Retry button would retry unrecoverable failures.                 | `upload.service.ts`                                     |
| 42  | **UX**           | When placement mode is active and the upload panel is open, clicks on the panel's map-overlapping area should not trigger placement. Need `stopPropagation` on the panel.                                                  | Accidental placement when clicking panel controls.               | `upload-panel.component.ts`                             |
| 43  | **UX**           | No file reordering in the queue. Users might want to prioritize certain files.                                                                                                                                             | Minor, but useful for 10+ file batches.                          | `upload-panel.component.ts`                             |
| 44  | **UX**           | The direction cone should dim or hide when it overlaps another marker to avoid visual clutter.                                                                                                                             | Cone overlap in dense marker areas.                              | (new) `direction-cone.component.ts`                     |
| 45  | **UX**           | No "place all remaining" bulk action for multiple `awaiting_placement` files. If a user has 10 no-GPS files from the same location, they should be able to place them all at one point.                                    | Tedious for batch no-GPS imports.                                | `upload-panel.component.ts`, `map-shell.component.ts`   |
| 46  | **UX**           | Marker should pulse/glow for 3 seconds after placement to confirm "it landed here".                                                                                                                                        | Post-placement confirmation is critical for spatial correctness. | `map-shell.component.ts/scss`                           |
| 47  | **UX**           | No map zoom-to-fit after batch upload finishes. If all files have GPS, the map should auto-zoom to show all new markers.                                                                                                   | Markers might be placed outside the current viewport.            | `map-shell.component.ts`                                |
| 48  | **UX**           | Panel close button (×) is missing. Users can only toggle from the toolbar button.                                                                                                                                          | Standard panel affordance missing.                               | `upload-panel.component.html`                           |
| 49  | **Architecture** | `UploadSuccess` includes `storagePath` which is an internal detail. Consider not exposing it to the component layer.                                                                                                       | Leaking storage internals to UI components.                      | `upload.service.ts`                                     |
| 50  | **UX**           | No progress percentage text next to the progress bar. The `<progress>` element alone is hard to read.                                                                                                                      | Numeric progress feedback missing.                               | `upload-panel.component.html`                           |

---

## Tier 3 — Medium (Issues 51–80)

Improvements for polish, spec alignment, and future-proofing.

| #   | Category          | Description                                                                                                                                                                                                | Impact                                                                                                | Files                                                     |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 51  | **UX**            | Direction cone should support "field of view" adjustment — some cameras have wider FOV. Default 30° but user-adjustable via drag handle on the cone edges.                                                 | One-size-fits-all 30° doesn't match all cameras.                                                      | (new) direction interaction code                          |
| 52  | **UX**            | Upload panel should minimize to a small floating badge (e.g., "3 ↑") when the user is interacting with the map. Auto-minimize after 5s of inactivity.                                                      | Panel occludes the map during other tasks.                                                            | `upload-panel.component.ts/scss`                          |
| 53  | **UX**            | Map should show a temporary "ghost marker" at the cursor position during placement mode, previewing where the marker will land.                                                                            | Users currently have to imagine where the marker will go.                                             | `map-shell.component.ts`                                  |
| 54  | **UX**            | Direction value should be shown in both degrees and cardinal direction (e.g., "127° SE").                                                                                                                  | Raw degrees are meaningless to most users.                                                            | direction cone tooltip                                    |
| 55  | **UX**            | No dark mode styles for the upload panel or placement banner. All colors are hardcoded light.                                                                                                              | Violates features.md §1.13 item 39 (dark mode).                                                       | `upload-panel.component.scss`, `map-shell.component.scss` |
| 56  | **UX**            | Panel animation: should slide in from the right rather than instantly appearing with `display: flex`.                                                                                                      | Jarring panel appearance.                                                                             | `upload-panel.component.scss`                             |
| 57  | **Architecture**  | `processFile()` and `doUpload()` are `async` methods fire-and-forgetting inside `drainQueue()`. No `catch` on the promise chain. An unhandled rejection would crash silently.                              | Potential unhandled promise rejection.                                                                | `upload-panel.component.ts`                               |
| 58  | **UX**            | The EXIF parsing status ("Reading EXIF…") should show what was found: "📍 GPS found" or "⚠️ No GPS".                                                                                                       | User wants to know what was detected.                                                                 | `upload-panel.component.ts/html`                          |
| 59  | **UX**            | No support for paste-to-upload (`Ctrl+V` with an image on clipboard). Common in screenshot workflows.                                                                                                      | Missing input pathway.                                                                                | `upload-panel.component.ts`                               |
| 60  | **UX**            | After upload, the panel should link the filename to the marker on the map. Clicking the filename pans + zooms to the marker and opens the popup.                                                           | Connect panel list items to map markers.                                                              | `upload-panel.component.ts`, `map-shell.component.ts`     |
| 61  | **Architecture**  | EXIF is parsed twice: once in `processFile()` (to check for GPS) and again in `uploadFile()` (to store values). Should parse once and pass the full `ParsedExif` through.                                  | Wasted work + potential inconsistency.                                                                | `upload.service.ts`, `upload-panel.component.ts`          |
| 62  | **UX**            | Direction editing should support a text input fallback — user types "127.5" directly instead of dragging.                                                                                                  | Precision entry for known bearings.                                                                   | direction editor                                          |
| 63  | **UX**            | No micro-animation for the marker drop. When a marker is added, it should "drop from above" (Leaflet has `riseOnHover`; extend with a CSS drop animation).                                                 | Standard map UX expectation.                                                                          | `map-shell.component.ts/scss`                             |
| 64  | **UX**            | The `error` badge shows "✗ Error" but the icon is small. Use a red background + white text for better visibility.                                                                                          | Error state is subtle.                                                                                | `upload-panel.component.scss`                             |
| 65  | **Accessibility** | Upload panel buttons have no `aria-live` feedback for state transitions. Screen reader users don't know when an upload completes.                                                                          | WCAG compliance gap.                                                                                  | `upload-panel.component.html`                             |
| 66  | **UX**            | Placement mode should timeout after 60 seconds of inactivity and show a "Placement timed out — click here to retry" message.                                                                               | User might forget they're in placement mode.                                                          | `map-shell.component.ts`                                  |
| 67  | **UX**            | The map cursor should change back from crosshair to grab immediately when placement completes (currently relies on Leaflet's default cursor reset which can be slow).                                      | Cursor sticks in crosshair momentarily.                                                               | `map-shell.component.ts`                                  |
| 68  | **UX**            | Multiple upload panels (from different toolbar buttons) are possible. Should enforce singleton — only one panel instance at a time.                                                                        | Currently one panel, but no guard against future duplication.                                         | `map-shell.component.ts`                                  |
| 69  | **UX**            | Direction cone should show a small camera icon at the marker to distinguish "has direction" from "no direction" markers.                                                                                   | Visual differentiation for direction-aware markers.                                                   | marker rendering code                                     |
| 70  | **UX**            | The drop zone text "Drag & drop images here or click to select files" should be responsive. On narrow panels, abbreviate to "Drop images or browse".                                                       | Text truncation on small screens.                                                                     | `upload-panel.component.html/scss`                        |
| 71  | **Architecture**  | `ImageUploadedEvent` should include `direction?: number` so the map can render the cone immediately without a re-fetch.                                                                                    | Event doesn't carry direction data.                                                                   | `upload-panel.component.ts`                               |
| 72  | **UX**            | When dragging a file from the OS file explorer to the **map area** (not the panel), the upload panel should auto-open and accept the drop.                                                                 | Extra step of opening panel first when using OS drag.                                                 | `map-shell.component.ts/html`                             |
| 73  | **UX**            | No upload history. Once dismissed, a completed upload is gone. A small "Recent uploads" section or notification bell would help.                                                                           | No persistent upload record in the session.                                                           | new component                                             |
| 74  | **UX**            | Panel should show estimated upload time based on file size and observed upload speed of previous files.                                                                                                    | No time expectation for large files.                                                                  | `upload-panel.component.ts`                               |
| 75  | **UX**            | The marker added by `onImageUploaded()` has no reference back to the upload panel entry. Clicking the marker should highlight the corresponding panel item.                                                | Two-way binding between panel and map is missing.                                                     | `map-shell.component.ts`                                  |
| 76  | **Architecture**  | Storage path uses `file.name.split('.').pop()` for the extension, which breaks for files like `photo.backup.jpg` (returns `jpg` correctly) but for extensionless files returns the filename.               | Edge case: extensionless files get weird storage paths.                                               | `upload.service.ts`                                       |
| 77  | **UX**            | Direction cone color should match the marker's state (blue for normal, green for fresh, orange for no direction).                                                                                          | Visual consistency between marker and cone.                                                           | marker/direction rendering                                |
| 78  | **UX**            | No "Upload another batch" prompt after all uploads complete. The drop zone just sits empty.                                                                                                                | Missed re-engagement opportunity.                                                                     | `upload-panel.component.html`                             |
| 79  | **Architecture**  | The `fileStates` signal is mutated with `update()` replacing the entire array on every state change. For 50+ files, this triggers re-rendering of all `@for` items (no `trackBy` in the new control flow). | Performance concern for large batches — `track trackByKey()` is used but the signal emission is O(n). | `upload-panel.component.ts`                               |
| 80  | **UX**            | No support for folder drop. Some users organize photos in folders and want to drop the entire folder at once.                                                                                              | Missing input pathway for organized workflows.                                                        | `upload-panel.component.ts`                               |

---

## Tier 4 — Low / Nice-to-Have (Issues 81–100)

Polish, edge cases, and forward-looking ideas.

| #   | Category         | Description                                                                                                                                                                                           | Impact                                                     | Files                                                 |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 81  | **UX**           | Micro-interaction: when a file transitions from `uploading` to `complete`, the progress bar should animate a green "fill flash" before switching to the checkmark.                                    | Satisfying completion moment.                              | `upload-panel.component.scss`                         |
| 82  | **UX**           | Direction cone rotation animation should have easing (ease-out) for a polished feel when the user releases the drag handle.                                                                           | Snappy vs. smooth — smooth is better for rotation.         | direction interaction                                 |
| 83  | **UX**           | Support multi-select of `awaiting_placement` items for batch placement at the same location ("place all here").                                                                                       | Convenience for co-located images without GPS.             | `upload-panel.component.ts`                           |
| 84  | **UX**           | The upload panel could show a mini-map thumbnail (static 200x200 map rendered via Leaflet with markers) for already-placed images.                                                                    | Visual spatial context within the panel.                   | `upload-panel.component.html`                         |
| 85  | **UX**           | Sound effect on upload complete (subtle "click" or "ding"). Respect `prefers-reduced-motion` and provide a mute toggle.                                                                               | Ambient audio feedback.                                    | `upload-panel.component.ts`                           |
| 86  | **UX**           | Marker tooltip on hover should show image thumbnail + direction arrow in a compact card (80x80 thumbnail + 60px cone preview).                                                                        | Richer hover info on the map.                              | `map-shell.component.ts`                              |
| 87  | **UX**           | Show EXIF capture date on the marker tooltip (if available). Format: relative ("2 days ago") or absolute based on user preference.                                                                    | Date context directly on the map.                          | `map-shell.component.ts`                              |
| 88  | **Architecture** | Should emit `UploadResult` events through an `Observable` or signal stream rather than individual outputs — this would enable `AsyncPipe` in templates and easier testing.                            | Architectural cleanliness.                                 | `upload-panel.component.ts`                           |
| 89  | **UX**           | Direction cone preview should appear in the upload panel item too (tiny inline SVG showing the bearing direction as a rotated arrow).                                                                 | Direction visible without hovering the marker.             | `upload-panel.component.html`                         |
| 90  | **UX**           | Consider an "auto-place" mode: if the user is GPS-enabled (browser geolocation), no-GPS images could default to the user's current position instead of requiring manual placement.                    | Useful for field work — photos taken right here.           | `upload-panel.component.ts`, `map-shell.component.ts` |
| 91  | **UX**           | Panel should shake or flash the drop zone on invalid file drop (wrong type or too large) — a red flash that fades over 500ms.                                                                         | Current error is only in the file list, not the drop zone. | `upload-panel.component.scss`                         |
| 92  | **UX**           | Support `Ctrl+Z` to undo the last placement (pop the marker and return the file to `awaiting_placement`).                                                                                             | Standard undo expectation.                                 | `map-shell.component.ts`                              |
| 93  | **Architecture** | The upload panel is tightly coupled to `MapShellComponent` via outputs. Consider a shared `UploadStateService` (signal-based) so other components (workspace, detail view) can also react to uploads. | Scalability for workspace integration.                     | new service                                           |
| 94  | **UX**           | On mobile, the upload panel should slide up from the bottom as a bottom sheet rather than appearing on the right side.                                                                                | Mobile layout (features.md §1.10 item 36) not implemented. | `upload-panel.component.scss`                         |
| 95  | **UX**           | Direction cone should cast a subtle semi-transparent "shadow" on the map tiles to enhance depth perception.                                                                                           | Visual polish.                                             | direction SVG rendering                               |
| 96  | **UX**           | After all uploads complete and panel is about to close, show a summary card: "5 images uploaded, 2 placed manually, 1 has bearing data".                                                              | Closure + summary for the batch.                           | `upload-panel.component.html/ts`                      |
| 97  | **Architecture** | `placeFile()` calls `doUpload()` which calls `uploadFile()` which parses EXIF again. Should pass `ParsedExif` from the first parse to avoid re-parsing.                                               | Triple EXIF parse for manually placed files.               | `upload.service.ts`, `upload-panel.component.ts`      |
| 98  | **UX**           | Consider an "import from URL" option (paste image URL → download + ingest). Post-MVP but the panel should have an extensible action bar to support this.                                              | Extensibility for future input sources.                    | `upload-panel.component.html`                         |
| 99  | **UX**           | Direction cone handle should show a compass rose overlay while being dragged, so the user can visually reference N/S/E/W.                                                                             | Navigation aid during direction editing.                   | direction editor                                      |
| 100 | **UX**           | "Upload & place" combined action: a toolbar button that enters "upload + place" mode — click the map first to set coordinates, then the file picker opens. Reverse of current flow.                   | Alternative workflow for users who think location-first.   | `map-shell.component.ts`, `upload-panel.component.ts` |

---

## Summary of Fixed Issues (this session)

| Issue # | Fix                                                                                                       | Tests Added                                    |
| ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1       | Added `placementRequested` output to `UploadPanelComponent`, wired to `enterPlacementMode()` in template. | 1 (placementRequested emission)                |
| 2       | `parseExif()` now reads `GPSImgDirection`; `uploadFile()` inserts `direction` column.                     | 8 (4 parseExif + 4 uploadFile direction tests) |
| 3       | Blue banner with "📍 Click the map to place the image" + crosshair cursor on map.                         | 2 (banner visible/hidden)                      |
| 4       | Cancel button on placement banner calls `cancelPlacement()`.                                              | 1 (cancelPlacement resets state)               |

**Test count:** 119 → 131 (12 new tests). All passing. `ng build` clean.

---

## Recommended Implementation Priority

### Phase 1 — Next session (M-IMPL4b)

- Issues 5, 8, 9 (panel lifecycle fixes)
- Issue 10, 21 (thumbnail previews in panel)
- Issue 39, 71 (add direction to `ImageUploadedEvent`)
- Issue 61, 97 (eliminate double EXIF parse)

### Phase 2 — Drag-to-map (M-IMPL4c)

- Issue 11 (drag from panel to map placement)
- Issue 53 (ghost marker during placement)
- Issue 46 (marker pulse animation on placement)
- Issue 14 (marker drop animation)

### Phase 3 — Direction cone UI (M-IMPL4d)

- Issue 12 (direction cone visualization on hover)
- Issue 24 (direction editing via drag handle)
- Issue 37 (snap to cardinal directions)
- Issue 62 (text input fallback)

### Phase 4 — Spec compliance (M-IMPL4e)

- Issues 18, 19, 20 (dimension validation, HEIC conversion, client compression)
- Issue 55 (dark mode for upload panel)
- Issue 94 (mobile bottom sheet layout)
