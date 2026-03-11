# Element Specs

Structured implementation contracts for every UI element in Sitesnap.
These are the **source of truth** that agents implement from.

See [agent-workflows/element-spec-format.md](../agent-workflows/element-spec-format.md) for the template.

## How To Use

1. Pick an element from the list below
2. Write its spec using the template (or ask an agent to draft it from the glossary)
3. Check `docs/implementation-blueprints/` for a companion blueprint with exact service signatures, data-flow diagrams, and database queries
4. Use `#plan-before-build` prompt to get an implementation plan
5. Use `#implement-element` prompt to build it
6. Use `#review-against-spec` prompt to verify

## Lint

Run `node scripts/lint-specs.mjs` from the project root to validate all specs. Rules:

| Rule                      | Severity   | Threshold | Description                                                                                                             |
| ------------------------- | ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `spec-max-lines`          | error/warn | 600 / 400 | Max lines per spec. Split oversized specs into parent + child specs with cross-references.                              |
| `spec-required-sections`  | error      | —         | Every spec must have: What It Is, What It Looks Like, Where It Lives, Actions, Component Hierarchy, Acceptance Criteria |
| `spec-section-order`      | warning    | —         | Sections should follow the canonical order from the template                                                            |
| `what-it-is-length`       | warning    | 5 lines   | Keep "What It Is" to 1–2 sentences                                                                                      |
| `what-it-looks-like-len`  | warning    | 40 lines  | Move visual detail to Actions or child specs                                                                            |
| `has-acceptance-criteria` | error      | —         | At least one `- [ ]` checkbox in Acceptance Criteria                                                                    |

Override thresholds: `node scripts/lint-specs.mjs --max-lines=300 --warn-lines=250`

### Splitting Large Specs

When a spec exceeds the line limit, split it into a **parent spec** (layout, navigation, cross-references) and **child specs** (focused feature areas). The parent keeps the original filename and adds a "Child Specs" section with links. See `image-detail-view.md` for an example.

## Elements (from Glossary)

Status: ✅ spec written | 🔲 needs spec

### Shell & Layout

- ✅ `map-shell.md` — Map Shell (top-level host)
- ✅ `map-zone.md` — Map Zone (flex container for map + floating controls)
- ✅ `sidebar.md` — Sidebar navigation rail
- ✅ `workspace-pane.md` — Right-side collapsible panel with group tabs
- ✅ `drag-divider.md` — Drag Divider (resizable map/workspace split)

### Search

- ✅ `search-bar.md` — Search Bar (multi-intent search surface)

### Map Markers

- ✅ `photo-marker.md` — Photo Marker (square thumbnail marker + cluster)
- ✅ `user-location-marker.md` — GPS user location marker

### Upload

- ✅ `upload-button-zone.md` — Upload Button Zone (FAB toggle)
- ✅ `upload-panel.md` — Upload Panel (drop zone + file list)
- ✅ `placement-mode.md` — Placement Mode (banner + crosshair)

### Workspace & Groups

- ✅ `active-selection-view.md` — Active Selection View (composed workspace content: toolbar + grid + grouping + filtering)
- ✅ `group-tab-bar.md` — Group Tab Bar
- ✅ `thumbnail-grid.md` — Thumbnail Grid (virtual scrolling gallery)
- ✅ `thumbnail-card.md` — Thumbnail Card (128×128 with hover actions)
- ✅ `workspace-toolbar.md` — Workspace Toolbar (sort/group/view controls)
- ✅ `workspace-view-system.md` — Workspace View System (data pipeline architecture)

### Panels & Detail

- ✅ `filter-panel.md` — Filter Panel (accordion filters)
- ✅ `filter-dropdown.md` — Filter Dropdown (shared dropdown primitive)
- ✅ `projects-dropdown.md` — Projects Dropdown (project selection filter)
- ✅ `active-filter-chips.md` — Active Filter Chips Strip
- ✅ `image-detail-view.md` — Image Detail View (parent: layout, nav, quick info)
  - ✅ `image-detail-photo-viewer.md` — Photo Viewer (progressive loading, lightbox, replace/upload)
  - ✅ `image-detail-inline-editing.md` — Inline Editing (property rows, address search)
  - ✅ `image-detail-actions.md` — Actions & Marker Sync (correction mode, delete, sync)
- ✅ `sort-dropdown.md` — Sort Dropdown (thumbnail sort order)
- ✅ `grouping-dropdown.md` — Grouping Dropdown (thumbnail group-by)

### Controls

- ✅ `gps-button.md` — GPS Button (center on user location)
- ✅ `theme-toggle.md` — Theme Toggle (light / dark / system)
- ✅ `radius-selection.md` — Radius Selection (right-click-drag circle)

### Pages

- ✅ `auth-map-background.md` — Auth Map Background (fixed city backdrop for login/register)
- ✅ `photos-page.md` — Photos Page
- ✅ `groups-page.md` — Groups Page
- ✅ `settings-page.md` — Settings Page
- ✅ `account-page.md` — Account Page

### Features (cross-cutting)

- ✅ `custom-properties.md` — Custom Properties (user-defined metadata schema)

## Priority

All specs are written. Use the search bar spec as the format reference.
Pick the spec for whatever you're building and follow the `#implement-element` prompt workflow.
