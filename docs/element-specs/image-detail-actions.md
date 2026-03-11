# Image Detail — Actions & Marker Sync

> **Parent spec:** [image-detail-view](image-detail-view.md)
> **Upload manager use cases:** [use-cases/upload-manager.md](../use-cases/upload-manager.md)
> **Map shell use cases:** [use-cases/map-shell.md](../use-cases/map-shell.md)

## What It Is

The actions section at the bottom of the Image Detail View and the marker synchronization system that keeps map markers up to date when image properties change. Actions include zooming to the photo's map location, project assignment, coordinate copying, and image deletion.

## What It Looks Like

Actions use **`dd-item`** button styling — not bordered outline buttons. Each action is a full-width row with a leading Material icon (`1rem`, `--color-text-secondary`), label text (`0.8125rem`), `dd-item` hover (warm clay tint), and `--radius-sm` border radius. A `dd-divider` separates destructive actions from normal ones. The delete action uses `dd-item--danger` style (red icon + label).

```pseudo
┌─ �  Zoom to location        ─┐   ← dd-item style, clay hover
├─ 📁  Add to project          ─┤   ← dd-item style, clay hover
├─ 📋  Copy coordinates        ─┤   ← dd-item style, clay hover
├──────────────────────────────-─┤   ← dd-divider
└─ 🗑️  Delete image            ─┘   ← dd-item--danger style
```

## Where It Lives

- **Parent**: `ImageDetailViewComponent` — ActionsSection at bottom of metadata column
- **Appears when**: Image detail view is open and image data is loaded

## Actions

| #   | User Action               | System Response                                                       | Triggers            |
| --- | ------------------------- | --------------------------------------------------------------------- | ------------------- |
| 1   | Clicks "Zoom to location" | Pans & zooms map to photo's coordinates, highlights marker with pulse | Map flyTo + marker  |
| 2   | Clicks "Add to project"   | Opens project picker                                                  | Project assignment  |
| 3   | Clicks "Copy coordinates" | Copies coordinates to clipboard, shows toast confirmation             | Clipboard + toast   |
| 4   | Clicks "Delete image"     | Shows delete confirmation dialog                                      | `showDeleteConfirm` |
| 5   | Confirms delete           | Deletes image from DB and storage, returns to grid                    | Supabase delete     |
| 6   | Cancels delete            | Dismisses dialog                                                      | Dialog dismissed    |

## Marker Sync — Live Updates

When the user makes changes in the detail view, the corresponding **photo marker on the map must update** without a full viewport refresh:

| Change Type                | Channel                                  | Marker Effect                                        |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Photo replaced             | `UploadManagerService.imageReplaced$`    | Marker DivIcon rebuilt with new thumbnail            |
| Photo uploaded (photoless) | `UploadManagerService.imageAttached$`    | Marker DivIcon updated: placeholder → real thumbnail |
| Coordinate correction      | Correction mode in MapShell (user drags) | Marker already at new position from drag             |
| Address / metadata edits   | DB update only                           | No marker update needed                              |

### Key Design Principle

The detail view **does not emit output events for marker sync**. Instead:

- **Photo changes** → delegate to `UploadManagerService` → manager emits `imageReplaced$` / `imageAttached$` → `MapShellComponent` subscribes directly
- **Coordinate changes** → handled by correction mode in `MapShellComponent` (marker drag is a map-layer operation)
- **Metadata edits** → saved to DB; no immediate marker visual change needed

## Component Hierarchy

```
ActionsSection                         ← dd-section-label "Actions", dd-item styled rows
├── ZoomToLocationAction               ← dd-item: my_location icon + "Zoom to location"
├── AddToProjectAction                 ← dd-item: folder_open icon + "Add to project"
├── CopyCoordinatesAction              ← dd-item: content_copy icon + "Copy coordinates"
├── dd-divider
└── DeleteAction                       ← dd-item--danger: delete icon + "Delete image"

[confirm] DeleteConfirmDialog          ← modal with cancel/confirm
```

## State

| Name                | Type      | Default | Controls                              |
| ------------------- | --------- | ------- | ------------------------------------- |
| `showDeleteConfirm` | `boolean` | `false` | Delete confirmation dialog visibility |
| `showContextMenu`   | `boolean` | `false` | Context menu visibility               |

## Interaction Flow

```mermaid
flowchart TD
    A[User opens Image Detail] --> B[Actions section visible]
    B --> C{User clicks action}

    C -->|Zoom to location| E[Emit zoomToLocationRequested]
    E --> E1[MapShell calls map.flyTo coords, zoom 18]
    E1 --> E2[Marker highlighted with pulse animation]

    C -->|Add to project| F[Open project picker]
    F --> F1[User selects project]
    F1 --> F2[Save assignment to DB]

    C -->|Copy coordinates| G[Write lat,lng to clipboard]
    G --> G1[Show toast confirmation]

    C -->|Delete image| H[Show delete confirmation dialog]
    H --> H1{User confirms?}
    H1 -->|Yes| H2[Delete from DB + Storage]
    H2 --> H3[Return to grid]
    H1 -->|No| H4[Dismiss dialog]
```

## Acceptance Criteria

- [x] Actions use **dd-item** button styling (not bordered outline buttons)
- [x] Each action: leading icon + label text, `0.8125rem` font
- [x] Hover uses warm clay tint matching all dropdown items
- [x] Delete action uses `dd-item--danger` style (red icon + label)
- [x] `dd-divider` separates destructive actions from normal ones
- [x] Zoom to location pans & zooms map to photo coordinates (flyTo, zoom 18)
- [x] Zoom to location highlights the target marker with a pulse animation
- [x] Zoom to location is disabled when image has no coordinates
- [ ] Add to project opens project picker
- [x] Copy coordinates writes to clipboard with toast confirmation
- [x] Delete confirmation dialog shown before removal
- [x] Replace Photo triggers marker thumbnail update via `UploadManagerService.imageReplaced$` (not direct output events)
- [x] Photo upload to photoless row triggers marker update via `UploadManagerService.imageAttached$`
- [x] Coordinate edit handled by MapShell directly — marker already at new position from drag
- [x] No output events for marker sync — flows through service layer
- [x] Metadata edits saved to DB only — no immediate marker visual change needed
