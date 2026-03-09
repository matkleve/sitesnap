# Image Detail View

> **Blueprint:** [implementation-blueprints/image-detail-view.md](../implementation-blueprints/image-detail-view.md)

## What It Is

The full detail view of a single photo. Shows the full-resolution image, metadata properties (editable), coordinates, correction history, and action menu. Desktop: replaces the thumbnail grid inside the Workspace Pane (with a back arrow to return). Mobile: full-screen overlay.

## What It Looks Like

**Desktop:** Takes over the Workspace Pane content area. Top: back arrow + image title. Below: full-width image (scrollable if tall). Below image: metadata property rows in two-column layout (key: value). Coordinates section shows lat/lng + correction indicator. Actions menu at bottom.

**Mobile:** Full-screen overlay with close button top-right. Image at top, metadata scrolls below.

Property rows follow Notion pattern: click the value → inline edit, no separate "Edit" button.

## Where It Lives

- **Parent**: Workspace Pane (replaces Thumbnail Grid when an image is selected)
- **Appears when**: User clicks a thumbnail card or map marker detail action

## Actions

| #   | User Action                     | System Response                             | Triggers               |
| --- | ------------------------------- | ------------------------------------------- | ---------------------- |
| 1   | Clicks back arrow (desktop)     | Returns to Thumbnail Grid                   | `detailImageId` → null |
| 2   | Clicks close (mobile)           | Closes overlay, returns to previous state   | Overlay dismissed      |
| 3   | Clicks a metadata value         | Value becomes an inline text input          | Edit mode              |
| 4   | Presses Enter or blurs input    | Saves updated metadata value                | Supabase update        |
| 5   | Clicks "Edit location"          | Enters correction mode (drag marker on map) | Correction flow        |
| 6   | Clicks "Add to group"           | Opens group picker                          | Group assignment       |
| 7   | Clicks "Delete" in actions menu | Confirmation dialog, then deletes image     | Supabase delete        |
| 8   | Scrolls down                    | Reveals more metadata and coordinate info   | Scroll                 |

## Component Hierarchy

```
ImageDetailView                            ← fills Workspace Pane content area (desktop) or full-screen (mobile)
├── DetailHeader
│   ├── BackButton (←)                     ← desktop: back to grid; mobile: close overlay
│   └── ImageTitle                         ← filename or address label, truncated
├── FullResImage                           ← full-width, loaded on demand (progressive loading tier 3)
├── MetadataSection
│   ├── MetadataPropertyRow × N            ← key (left, secondary) | value (right, primary, click-to-edit)
│   │   └── [editing] InlineInput          ← replaces value text
│   ├── CoordinatesRow                     ← lat, lng display
│   │   └── [corrected] CorrectionBadge   ← "Corrected" badge with original EXIF shown below
│   └── TimestampRow                       ← captured_at or created_at
├── DetailActions
│   ├── EditLocationButton                 ← ghost button "Edit location"
│   ├── AddToGroupButton                   ← ghost button "Add to group"
│   └── ContextMenu (⋯)                   ← Delete, Copy coordinates, etc.
└── [corrected] CorrectionHistory
    ├── OriginalCoords                     ← "Original EXIF: lat, lng"
    └── CorrectedCoords                    ← "Corrected: lat, lng" + date
```

## Data

| Field              | Source                                                                                | Type                               |
| ------------------ | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Image record       | `supabase.from('images').select('*')`                                                 | `Image`                            |
| Full-res URL       | Supabase Storage signed URL (original)                                                | `string`                           |
| Metadata           | `supabase.from('image_metadata').select('key, value')`                                | `{ key: string, value: string }[]` |
| Correction history | `images.corrected_lat`, `images.corrected_lng`, `images.latitude`, `images.longitude` | Coordinate pairs                   |

## State

| Name            | Type             | Default | Controls                                  |
| --------------- | ---------------- | ------- | ----------------------------------------- |
| `image`         | `Image \| null`  | `null`  | The displayed image record                |
| `editingKey`    | `string \| null` | `null`  | Which metadata key is being edited inline |
| `fullResLoaded` | `boolean`        | `false` | Whether full-res image has loaded         |

## File Map

| File                                                             | Purpose                    |
| ---------------------------------------------------------------- | -------------------------- |
| `features/map/workspace-pane/image-detail-view.component.ts`     | Detail view component      |
| `features/map/workspace-pane/image-detail-view.component.html`   | Template                   |
| `features/map/workspace-pane/image-detail-view.component.scss`   | Styles                     |
| `features/map/workspace-pane/metadata-property-row.component.ts` | Reusable click-to-edit row |

## Wiring

- Displayed inside Workspace Pane when `detailImageId` is set
- On desktop: replaces Thumbnail Grid, back arrow returns to grid
- On mobile: opens as full-screen overlay on top of current view
- Metadata edits call `SupabaseService` to update `image_metadata`
- "Edit location" triggers correction mode in `MapShellComponent`

## Acceptance Criteria

- [ ] Desktop: replaces grid in workspace pane, back arrow returns
- [ ] Mobile: full-screen overlay with close button
- [ ] Full-res image loads on demand (shows thumbnail first)
- [ ] Metadata rows: click value → inline edit → save on Enter/blur
- [ ] Coordinates displayed with correction indicator if corrected
- [ ] Original EXIF coordinates shown when correction exists (Honesty principle)
- [ ] Edit location button starts marker correction mode
- [ ] Add to group opens group picker
- [ ] Delete confirmation before removal
