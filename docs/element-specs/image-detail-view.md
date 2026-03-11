# Image Detail View

> **Blueprint:** [implementation-blueprints/image-detail-view.md](../implementation-blueprints/image-detail-view.md)
> **Photo loading use cases:** [use-cases/photo-loading.md](../use-cases/photo-loading.md)
> **Editing use cases:** [use-cases/image-editing.md](../use-cases/image-editing.md)

## What It Is

The full detail view of a single photo. Shows the full-resolution image with all properties editable inline. Users can modify the address label (title), captured date, project assignment, address components (street, city, district, country), custom metadata key/values, and location. Desktop: replaces the thumbnail grid inside the Workspace Pane (with a back arrow to return). Mobile: full-screen overlay.

## Child Specs

This spec covers layout, responsive behavior, navigation, and the Quick Info Bar. Feature-specific behavior is in these child specs:

| Child Spec | Covers |
| --- | --- |
| [image-detail-photo-viewer](image-detail-photo-viewer.md) | Progressive loading, lightbox, replace/upload photo |
| [image-detail-inline-editing](image-detail-inline-editing.md) | Click-to-edit fields, address search, property rows |
| [custom-metadata](custom-metadata.md) | Metadata CRUD, chip types, typeahead add flow |
| [image-detail-actions](image-detail-actions.md) | Actions section, delete, marker sync, correction mode |

## What It Looks Like

### Toolbar Behavior

When the detail view is open, the **Workspace Toolbar** (operators: Grouping, Filter, Sort, Projects) is **hidden**. The detail view fills the full content area below the pane header. The toolbar reappears when the user navigates back to the thumbnail grid.

### Layout Modes

**Wide pane (≥ 640px):** Two-column layout — photo on the left (flexible width), metadata panel on the right (fixed ~320px). The photo fills the available height with `object-fit: contain` against a dark letterbox. The metadata panel scrolls independently.

**Narrow pane (< 640px):** Single-column stack — photo on top (full width, `max-height: 55vw`), then Details, Custom Metadata, and Actions below. On mobile this is a full-screen overlay with a close button top-right.

The entire detail container is capped at `900px` max-width and centered (`margin: 0 auto`). The metadata content area is capped at `max-width: 400px`.

### Quick Info Bar

Immediately below the photo, a horizontal row of **info chips** provides at-a-glance context:

- **Project chip**: folder icon + project name. Filled `--color-primary` if assigned, outlined `--color-border` if none. Click opens project picker.
- **Date chip**: calendar icon + formatted capture date. Click enters edit mode (datetime-local).
- **GPS chip**: location icon + "GPS" or "Corrected". `--color-success` tint if has coords, `--color-warning` if missing. Click copies coordinates.

Chips use `rounded-full` radius, `--text-caption` size (12px), compact padding (`--spacing-1` block, `--spacing-2` inline). They wrap on narrow panes.

## Responsive Layout

The layout responds to the **workspace pane width** (measured via `ResizeObserver` on the host element), not the browser viewport.

### Breakpoints (pane-local)

| Name   | Pane Width | Layout                         |
| ------ | ---------- | ------------------------------ |
| Narrow | < 480px    | Single column, compact spacing |
| Medium | 480–720px  | Single column, comfortable     |
| Wide   | > 720px    | Two columns: photo \| metadata |

### Container Constraints

```
max-width:  900px
margin:     0 auto
width:      100%
```

### Two-Column Grid (≥ 640px)

```
display:               grid
grid-template-columns:  minmax(300px, 1fr) 320px
```

### Measurement

```typescript
// Angular: use a host-bound ResizeObserver, NOT window resize
onInit: observer = new ResizeObserver((entries) => {
  paneWidth = entries[0].contentRect.width;
});
observer.observe(hostElement);
onDestroy: observer.disconnect();
```

## Where It Lives

- **Parent**: Workspace Pane (replaces Thumbnail Grid when an image is selected)
- **Appears when**: User clicks a thumbnail card or map marker detail action

## Actions

| #   | User Action                    | System Response                                  | Triggers               |
| --- | ------------------------------ | ------------------------------------------------ | ---------------------- |
| 1   | Clicks back arrow (desktop)    | Returns to Thumbnail Grid                        | `detailImageId` → null |
| 2   | Clicks close (mobile)          | Closes overlay, returns to previous state         | Overlay dismissed      |
| 3   | Clicks quick-info project chip | Opens project select dropdown                    | Project picker         |
| 4   | Clicks quick-info date chip    | Enters date edit mode                            | Date edit              |
| 5   | Clicks quick-info GPS chip     | Copies coordinates to clipboard (toast)          | Clipboard + toast      |
| 6   | Scrolls down                   | Reveals more metadata and coordinate info        | Scroll                 |

> See child specs for photo viewer, inline editing, metadata, and action interactions.

## Component Hierarchy

```
ImageDetailView                            ← fills Workspace Pane content area (desktop) or full-screen (mobile)
│                                             max-width: 900px, margin: 0 auto, width: 100%
│                                             ResizeObserver on host → paneWidth signal
│                                             PARENT HIDES workspace-toolbar when this is shown
│
├── DetailHeader                           ← always full width, sticky top
│   ├── BackButton (←)                     ← desktop: back to grid; mobile: close overlay
│   ├── ImageTitle                         ← address label, click-to-edit inline, --text-h2 weight 600
│   │   └── [editing] InlineInput          ← replaces title text, saves on Enter/blur
│   └── ContextMenuTrigger (⋯)
│       └── [open] ContextMenu             ← uses dd-items / dd-item / dd-item--danger classes
│
├── [paneWidth ≥ 640] TwoColumnLayout      ← grid: minmax(300px, 1fr) 320px
│   ├── PhotoColumn                        ← see image-detail-photo-viewer.md
│   └── MetadataColumn                     ← fixed ~320px, max-width: 400px, scrolls independently
│       ├── QuickInfoBar                   ← this spec (above)
│       ├── DetailsSection                 ← see image-detail-inline-editing.md
│       ├── LocationSection                ← see image-detail-inline-editing.md
│       ├── MetadataSection                ← see custom-metadata.md
│       └── ActionsSection                 ← see image-detail-actions.md
│
├── [paneWidth < 640] SingleColumnLayout
│   ├── PhotoColumn                        ← see image-detail-photo-viewer.md
│   └── MetadataContent                    ← max-width: 400px, margin: 0 auto
│       ├── QuickInfoBar
│       ├── DetailsSection
│       ├── LocationSection
│       ├── MetadataSection
│       └── ActionsSection
│
└── QuickInfoBar                           ← horizontal chip row below photo
    ├── ProjectChip                        ← folder icon + name, filled if assigned
    ├── DateChip                           ← calendar icon + date, click to edit
    └── GpsChip                            ← location icon + status, click copies coords
```

## Data

| Field              | Source                                                | Type                             |
| ------------------ | ----------------------------------------------------- | -------------------------------- |
| Image record       | `supabase.from('images').select('*')`                 | `ImageRecord`                    |
| Projects list      | `supabase.from('projects').select('id, name').eq(…)`  | `{ id: string, name: string }[]` |

> See child specs for photo URLs, metadata, and correction history data sources.

## State

| Name             | Type                  | Default | Controls                                         |
| ---------------- | --------------------- | ------- | ------------------------------------------------ |
| `image`          | `ImageRecord \| null` | `null`  | The displayed image record                       |
| `loading`        | `boolean`             | `false` | Whether record is loading from Supabase          |
| `error`          | `string \| null`      | `null`  | Error message if load failed                     |
| `paneWidth`      | `number`              | `0`     | Measured via ResizeObserver on host element (px)  |

> See child specs for photo viewer, inline editing, metadata, and action state.

### Loading Resolution for Photoless Items

When the Supabase record loads and `storage_path IS NULL`, the view is **fully resolved** — `loading` becomes `false` immediately. The PhotoViewer shows its upload prompt as a final state, not as a loading intermediate. No signed URL requests are made, no progressive loading pipeline starts. The metadata panel, actions, and Quick Info Bar are all usable right away.

## File Map

| File                                                              | Purpose                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| `features/map/workspace-pane/image-detail-view.component.ts`      | Detail view component                                   |
| `features/map/workspace-pane/image-detail-view.component.html`    | Template                                                |
| `features/map/workspace-pane/image-detail-view.component.scss`    | Styles                                                  |
| `features/map/workspace-pane/image-detail-view.component.spec.ts` | Unit tests                                              |
| `features/map/workspace-pane/editable-property-row.component.ts`  | Click-to-edit row for image fields (text, date, select) |

## Wiring

- Displayed inside Workspace Pane when `detailImageId` is set
- On desktop: replaces Thumbnail Grid, back arrow returns to grid
- On mobile: opens as full-screen overlay on top of current view

## Acceptance Criteria

### Toolbar & Layout

- [ ] Workspace toolbar (operators) is **hidden** when detail view is open
- [ ] Workspace toolbar reappears when detail view closes (back to grid)
- [ ] Uses `ResizeObserver` on host element to measure pane width (not `window.innerWidth`)
- [ ] Wide pane (≥ 640px): two-column grid — photo left (flexible), metadata right (~320px fixed)
- [ ] Narrow pane (< 640px): single-column stack — photo on top, metadata below
- [ ] Detail container capped at 900px max-width, centered via `margin: 0 auto`
- [ ] Metadata content area capped at **400px max-width** — centers in available space
- [ ] Metadata column scrolls independently from photo column in wide layout

### Quick Info Bar

- [ ] Horizontal chip row below photo with Project, Date, GPS chips
- [ ] Project chip: filled `--color-primary` when assigned, outlined when empty
- [ ] Date chip: calendar icon + formatted date, click enters date edit
- [ ] GPS chip: `--color-success` tint with coordinates, `--color-warning` if missing GPS
- [ ] Chips use `rounded-full`, `--text-caption` size, compact padding
- [ ] Chips wrap on narrow panes

### Navigation

- [ ] Desktop: replaces grid in workspace pane, back arrow returns
- [ ] Mobile: full-screen overlay with close button

> See child specs for photo viewer, inline editing, metadata, and action acceptance criteria.
