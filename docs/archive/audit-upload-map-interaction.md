# Upload, Map Interaction & Direction UX Audit

**Date:** 2026-03-04  
**Scope:** Upload pipeline, map placement, marker lifecycle, and direction/bearing UX  
**Goal:** Keep deep-dive patterns and track only open implementation issues

---

## Table of Contents

- [Part A — Deep-Dive: Three Key Interaction Patterns](#part-a--deep-dive-three-key-interaction-patterns)
  - [Pattern 1: Drag-from-Panel-to-Map Placement](#pattern-1-drag-from-panel-to-map-placement)
  - [Pattern 2: Direction Cone Visualization & Editing](#pattern-2-direction-cone-visualization--editing)
  - [Pattern 3: Post-Upload Marker Lifecycle](#pattern-3-post-upload-marker-lifecycle)
- [Part B — Open Upload/Map Backlog (Triaged)](#part-b--open-uploadmap-backlog-triaged)

---

# Part A — Deep-Dive: Three Key Interaction Patterns

---

## Pattern 1: Drag-from-Panel-to-Map Placement

**Current state**

- Missing-GPS files can be placed via placement mode (click-to-place).

**Open enhancement direction**

- Add direct drag-from-panel-to-map placement for faster no-GPS workflows.
- Keep pointer-events-based interaction for better animation/control and touch parity.

---

## Pattern 2: Direction Cone Visualization & Editing

**Current state**

- Direction is stored from EXIF but not surfaced/edited in map UI.

**Open enhancement direction**

- Render a cone/wedge on hover/select for markers with direction.
- Support direct adjustment and save-back flow with clear error handling.

---

## Pattern 3: Post-Upload Marker Lifecycle

**Current state**

- Marker appears after upload but has minimal lifecycle feedback.

**Open enhancement direction**

- Add richer lifecycle states (fresh, selected, editing, error) and stronger map↔panel continuity.

---

# Part B — Open Upload/Map Backlog (Triaged)

Status values: `Open`, `In Progress`, `Done`, `Won’t Do`  
Priority values: `P0` (blocker), `P1` (high), `P2` (polish)

## Backlog Table

| ID     | Priority | Status | Area          | Open Item                                                                                          | Milestone |
| ------ | -------- | ------ | ------------- | -------------------------------------------------------------------------------------------------- | --------- |
| UPL-01 | P0       | Open   | Validation    | Add image dimension validation (min 100×100, max 8192×8192).                                       | M-IMPL4e  |
| UPL-02 | P0       | Open   | Validation    | Add HEIC/HEIF client conversion before upload.                                                     | M-IMPL4e  |
| UPL-03 | P0       | Open   | Validation    | Add client-side resize/compression for images >4096px.                                             | M-IMPL4e  |
| UPL-04 | P0       | Open   | Resilience    | Handle storage-upload success + DB-insert failure rollback path.                                   | M-IMPL4e  |
| UPL-05 | P0       | Open   | Map panel     | Ensure map-side panel and upload panel interactions never trigger accidental map placement clicks. | M-UI5     |
| UPL-06 | P1       | Open   | Placement     | Add drag-to-map placement for `awaiting_placement` items.                                          | M-IMPL4d  |
| UPL-07 | P1       | Open   | Placement     | Add filename/context cue for the currently placing item.                                           | M-IMPL4d  |
| UPL-08 | P1       | Open   | Batch UX      | Add aggregate batch progress summary (`x/y uploaded`).                                             | M-IMPL4d  |
| UPL-09 | P1       | Open   | Batch UX      | Add queue indicator for multiple no-GPS files (`1 of N to place`).                                 | M-IMPL4d  |
| UPL-10 | P1       | Open   | Marker UX     | Add marker pulse/confirmation after placement/upload completes.                                    | M-IMPL4d  |
| UPL-11 | P1       | Open   | Direction     | Add direction cone rendering for markers with direction metadata.                                  | M-IMPL4d  |
| UPL-12 | P1       | Open   | Direction     | Add direction editing interaction + persist flow.                                                  | M-IMPL4d  |
| UPL-13 | P1       | Open   | Accessibility | Add stronger SR announcements for placement mode activation/completion.                            | M-IMPL4d  |
| UPL-14 | P2       | Open   | Convenience   | Add keyboard shortcut to open/close upload panel.                                                  | M-UI5     |
| UPL-15 | P2       | Open   | Convenience   | Add “center map on uploaded marker” action from panel row.                                         | M-IMPL4d  |
| UPL-16 | P2       | Open   | Visual        | Add richer marker popup content (thumb + metadata) instead of ID-only popup.                       | M-UI4     |

---

## Recently Closed (Reference)

The following previously-audited issues are implemented:

- Placement mode wiring bug fixed (`placementRequested` flow) — M-IMPL4a ✅
- Direction extraction from EXIF persisted to DB — M-IMPL4a ✅
- Retry support + thumbnail previews + dismiss stuck awaiting-placement items — M-IMPL4b ✅
- Double EXIF parse eliminated via parsed EXIF pass-through — M-IMPL4b ✅

---

## Working Rules

1. Keep Part A for interaction intent and tradeoffs.
2. Keep Part B as open items only.
3. Each new issue must include priority + milestone.
4. When closed, mark `Done` and reference the milestone entry in `milestones.md`.
