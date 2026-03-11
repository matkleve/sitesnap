# Image Detail View

> **Blueprint:** [implementation-blueprints/image-detail-view.md](../implementation-blueprints/image-detail-view.md)
> **Photo loading use cases:** [use-cases/photo-loading.md](../use-cases/photo-loading.md)
> **Editing use cases:** [use-cases/image-editing.md](../use-cases/image-editing.md)

## What It Is

The full detail view of a single photo. Shows the full-resolution image with all properties editable inline. Users can modify the address label (title), captured date, project assignment, address components (street, city, district, country), custom metadata key/values, and location. Desktop: replaces the thumbnail grid inside the Workspace Pane (with a back arrow to return). Mobile: full-screen overlay.

## What It Looks Like

### Toolbar Behavior

When the detail view is open, the **Workspace Toolbar** (operators: Grouping, Filter, Sort, Projects) is **hidden**. The detail view fills the full content area below the pane header. Operators are irrelevant when viewing a single photo — removing them reclaims vertical space and reduces visual noise. The toolbar reappears when the user navigates back to the thumbnail grid.

### Layout Modes

**Wide pane (≥ 640px):** Two-column layout — photo on the left (flexible width), metadata panel on the right (fixed ~320px). The photo fills the available height with `object-fit: contain` against a dark letterbox. The metadata panel scrolls independently.

**Narrow pane (< 640px):** Single-column stack — photo on top (full width, `max-height: 55vw`), then Details, Custom Metadata, and Actions below. On mobile this is a full-screen overlay with a close button top-right.

The entire detail container is capped at `900px` max-width and centered (`margin: 0 auto`) so it doesn't stretch uncomfortably in very wide panes.

### Metadata Content Width

The metadata content area (both in single-column and as the right panel in two-column) is **capped at `max-width: 400px`**. This keeps labels and values close together so the eye doesn't have to travel across wide empty space. In single-column mode, the metadata block centers itself horizontally.

### Visual Hierarchy (top to bottom)

The design follows a strict information hierarchy. Each data field is placed according to its importance to the field technician's workflow:

#### 1. Header Bar (CRITICAL — navigation + identity)

Back arrow + editable title (address label) + context menu trigger. Follows current pattern. The title is the most prominent text element — `--text-h2` weight 600. Uses `dd-item` style context menu.

#### 2. Hero Photo (HIGHEST — the content itself)

Full-resolution image with progressive loading (placeholder → thumbnail → full-res). The photo is the reason the user is here.

- **Size**: Fixed to approximately **1/3 of the viewport height** (`max-height: 33vh`), maintaining a 4:3 aspect ratio. The photo does not grow with pane width — it stays compact to leave room for metadata below.
- **Shape**: Rounded corners (`--radius-lg`), horizontally centered with side margins (`--spacing-4`). On hover, a subtle `--color-primary` ring appears.
- **Click to enlarge**: Clicking the photo opens a **full-screen lightbox overlay** (dark backdrop, `rgba(0,0,0,0.9)`). The lightbox shows the image at `95vw / 95vh` max with `object-fit: contain`. Close button (X) top-right. Click backdrop or press Escape to close.
- **Replace Photo button**: An `edit` Material Icon button is positioned in the **top-right corner** of the image container, overlaid on the image. Appears on hover (desktop) or always visible (touch). Uses a semi-transparent dark scrim (`rgba(0,0,0,0.5)`) for contrast. Clicking opens the native file picker to replace the photo file. See use case [IE-10](../use-cases/image-editing.md#ie-10-replace-photo-file).

#### 3. Quick Info Bar (HIGH — at-a-glance context)

Immediately below the photo, a horizontal row of **info chips** provides the most important metadata at a glance without scrolling:

- **Project chip**: folder icon + project name. Filled `--color-primary` if assigned, outlined `--color-border` if none. Click opens project picker.
- **Date chip**: calendar icon + formatted capture date. Click enters edit mode (datetime-local).
- **GPS chip**: location icon + "GPS" or "Corrected". `--color-success` tint if has coords, `--color-warning` if missing. Click copies coordinates.

Chips use `rounded-full` radius, `--text-caption` size (12px), compact padding (`--spacing-1` block, `--spacing-2` inline). They sit in a horizontal flex row that wraps on narrow panes.

#### 4. Details Section (MEDIUM-HIGH — editable properties)

Section heading uses the **`dd-section-label`** style: `0.6875rem`, uppercase, `600` weight, `--color-text-disabled`, `letter-spacing: 0.06em`.

Each property row is redesigned with **leading icons**:

```pseudo
┌─ icon ─┬─ label ──────┬─ value (click to edit) ─┬─ edit-icon ─┐
│  🏠    │  Street      │  123 Main St            │  ✏️ (hover)  │
└────────┴──────────────┴─────────────────────────┴─────────────┘
```

- **Leading icon**: `1rem` Material icon, `--color-text-secondary`. Provides instant visual identification.
- **Label**: `--text-small` (13px), `--color-text-secondary`.
- **Value**: `--text-body` (15px), `--color-text-primary`. Click activates inline edit.
- **Edit icon**: `edit` Material icon, hidden at rest, appears on row hover. Uses the `dd-drag-handle` visibility pattern (hidden → visible on parent hover).
- **Row hover**: warm clay tint (`color-mix(in srgb, var(--color-clay) 8%, transparent)`), matching all dropdown hover states.
- **Row geometry**: follows `dd-item` pattern — `gap: --spacing-2`, `padding: --spacing-1 --spacing-2`, `--radius-sm`.

Property row icon mapping:

| Field    | Icon            | Importance | Notes                           |
| -------- | --------------- | ---------- | ------------------------------- |
| Captured | `schedule`      | High       | When the photo was taken        |
| Project  | `folder`        | High       | Organizational grouping         |
| Street   | `signpost`      | Medium     | Part of address group           |
| City     | `location_city` | Medium     | Part of address group           |
| District | `map`           | Low-Medium | Part of address group           |
| Country  | `public`        | Low        | Part of address group           |
| Location | `my_location`   | Medium     | GPS coords, read-only           |
| Uploaded | `cloud_upload`  | Low        | Informational, read-only, muted |

Read-only rows (Location, Uploaded) display with `--color-text-secondary` value text and no edit icon on hover.

#### 5. Address Group

Street, City, District, Country are visually grouped under a **“Location”** section heading (dd-section-label).

At the top of this group sits an **Address Search Bar** — a full-width dd-item styled trigger that shows the assembled address (`street, city, district, country`) or “Search address…” as placeholder. Clicking it activates search mode:

- An input field appears with a search icon (left) and clear button (right).
- As the user types, `GeocodingService.forward()` is called (debounced 400ms) to get Nominatim results.
- Results appear in a dropdown panel using `dd-items` / `dd-item` styling.
- Selecting a result auto-fills **all** address fields (street, city, district, country, address_label) in one action, with optimistic Supabase update.
- Press Enter to select the first result. Press Escape to cancel.

Below the search bar, individual Street / City / District / Country rows remain for manual editing. The GPS coordinates row appears at the bottom of this group with the correction badge if applicable.

#### 6. Custom Metadata Section (VARIABLE)

Section heading: "Metadata" (dd-section-label style). Same icon + label + value row pattern. Chip-type metadata renders inline chip groups. Delete icon appears on hover (right side).
**Adding metadata** uses a Notion-style autocomplete flow:

- Click “Add metadata” to reveal key + value inputs.
- As the user types in the key field, existing metadata key names (from `metadata_keys` table) are filtered and shown as suggestions in a dropdown.
- Clicking a suggestion fills the key input and focuses the value field.
- Press **Enter** on the key field to move to value. Press **Enter** on the value field to save.
- The save button uses `dd-item` styling (not a filled blue button) — it’s a neutral icon button that darkens on hover.
  **Chip-type metadata** renders inline as a horizontal chip group. The selected chip gets a filled style (`--color-primary` bg), unselected chips are outlined. Clicking a chip saves immediately — no confirm step needed (it's a single-select categorical value). On narrow layouts, chips wrap.

#### 7. Actions Section (LOW priority but accessible)

Actions use **`dd-item`** button styling — not bordered outline buttons. Each action is a full-width row with:

- Leading Material icon (`1rem`, `--color-text-secondary`)
- Label text (`0.8125rem`)
- `dd-item` hover (warm clay tint)
- `--radius-sm` border radius

```pseudo
┌─ 🗺️  Edit location          ─┐   ← dd-item style, clay hover
├─ 📁  Add to project          ─┤   ← dd-item style, clay hover
├─ 📋  Copy coordinates        ─┤   ← dd-item style, clay hover
├──────────────────────────────-─┤   ← dd-divider
└─ 🗑️  Delete image            ─┘   ← dd-item--danger style
```

### Correction History

When the image has a corrected location, a subtle callout appears below the GPS row using `--color-accent` tinting (already implemented). Shows original EXIF vs corrected coordinates.

### Interaction Pseudo Code

```pseudo
WHEN detail view opens:
  workspace-toolbar.hidden = true
  detail-view fills pane content area (below pane-header)
  load image data, metadata, project options
  show progressive image (placeholder → thumbnail → full-res)

WHEN detail view closes:
  workspace-toolbar.hidden = false
  return to thumbnail grid

ON property row hover:
  show warm clay background tint
  show edit icon (pencil) on right side

ON property row click (editable):
  replace value text with inline input (text / datetime-local / select)
  focus input
  ON Enter or blur → save to Supabase (optimistic update)
  ON Escape → cancel, restore previous value

ON quick-info chip click:
  project chip → open project select dropdown
  date chip → enter date edit mode
  gps chip → copy coordinates to clipboard (toast confirmation)

ON photo click:
  open lightbox overlay (fixed, dark backdrop, z-modal)
  show full-res image at 95vw / 95vh, object-fit: contain
  ON click backdrop or X button or Escape → close lightbox

ON address search trigger click:
  show address search input (focused)
  ON input (debounced 400ms) → GeocodingService.forward(query)
  show results in dd-item dropdown
  ON Enter → apply first result
  ON result click → apply selected result
  ON Escape → cancel search, restore trigger
  applyAddressSuggestion:
    update street, city, district, country, address_label
    optimistic Supabase update

ON metadata key input:
  filter allMetadataKeyNames (loaded from metadata_keys table)
  exclude keys already assigned to this image
  show suggestions in dropdown
  ON suggestion click → fill key, focus value input
  ON Enter in key input → focus value input
  ON Enter in value input → save metadata entry

ON action row click:
  "Edit location" → emit editLocationRequested
  "Add to project" → open project picker
  "Copy coordinates" → clipboard + toast
  "Delete image" → show delete confirmation dialog

ON action row hover:
  warm clay tint (color-mix(in srgb, var(--color-clay) 8%, transparent))
  matches all dropdown item hover states
```

## Responsive Layout

The layout responds to the **workspace pane width** (measured via `ResizeObserver` on the host element), not the browser viewport. The user can independently resize the map/workspace split, so `window.innerWidth` is incorrect.

### Breakpoints (pane-local)

| Name   | Pane Width | Layout                         |
| ------ | ---------- | ------------------------------ |
| Narrow | < 480px    | Single column, compact spacing |
| Medium | 480–720px  | Single column, comfortable     |
| Wide   | > 720px    | Two columns: photo \| metadata |

The two-column split happens at **640px minimum** (photo needs ≥ 340px, metadata panel needs ≥ 300px). Below that: stack vertically.

### Container Constraints

```
max-width:  900px
margin:     0 auto        // centers in wide pane
width:      100%
```

### Two-Column Grid (≥ 640px)

```
display:               grid
grid-template-columns:  minmax(300px, 1fr) 320px
```

Photo column takes the flexible space. Metadata column is a fixed ~320px, scrollable independently.

### PhotoViewer Sizing

| Layout | Rule                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Wide   | `height: 100%`, `max-height: calc(100vh - 60px)`, `object-fit: contain`, `background: #111` (letterbox) |
| Narrow | `width: 100%`, `max-height: 55vw`, `object-fit: contain`                                                |

> **Note:** `55vw` is a viewport unit — a deliberate pragmatic compromise since CSS cannot reference an observed pane width natively. For pane-accurate sizing, set a `--pane-width` custom property from the ResizeObserver callback and use `calc(0.55 * var(--pane-width))` instead.

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

| #   | User Action                                | System Response                                                                                                                                                                                                                                                       | Triggers                         |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Clicks back arrow (desktop)                | Returns to Thumbnail Grid                                                                                                                                                                                                                                             | `detailImageId` → null           |
| 2   | Clicks close (mobile)                      | Closes overlay, returns to previous state                                                                                                                                                                                                                             | Overlay dismissed                |
| 3   | Clicks address label (title)               | Title becomes an inline text input                                                                                                                                                                                                                                    | `editingField` → `address_label` |
| 4   | Presses Enter or blurs title input         | Saves updated address_label to `images` table                                                                                                                                                                                                                         | Supabase update                  |
| 5   | Clicks captured date value                 | Date becomes a `datetime-local` input                                                                                                                                                                                                                                 | `editingField` → `captured_at`   |
| 6   | Picks new date/time, blurs                 | Saves updated captured_at to `images` table                                                                                                                                                                                                                           | Supabase update                  |
| 7   | Clicks project value                       | Value becomes a `<select>` dropdown with org projects                                                                                                                                                                                                                 | `editingField` → `project_id`    |
| 8   | Selects a project                          | Saves project_id to `images` table                                                                                                                                                                                                                                    | Supabase update                  |
| 9   | Clicks street/city/district/country value  | Value becomes an inline text input                                                                                                                                                                                                                                    | `editingField` → field name      |
| 10  | Presses Enter or blurs address input       | Saves updated address component to `images` table                                                                                                                                                                                                                     | Supabase update                  |
| 11  | Clicks a custom metadata value             | Value becomes an inline text input                                                                                                                                                                                                                                    | Edit mode                        |
| 12  | Presses Enter or blurs input               | Saves updated metadata value via upsert                                                                                                                                                                                                                               | Supabase upsert                  |
| 13  | Clicks "Add metadata" button               | New row with typeahead key input appears                                                                                                                                                                                                                              | `showAddMetadata` → true         |
| 14  | Types in key field (≥ 1 char)              | Queries `metadata_keys` (ILIKE), shows suggestion dropdown                                                                                                                                                                                                            | Typeahead query                  |
| 15  | Selects a key suggestion                   | Sets `keyId`, loads `value_type` + `chip_options`, focuses value field                                                                                                                                                                                                | Schema loaded                    |
| 16  | Clicks "Create \"{input}\""                | Creates new key with `value_type = "text"`, proceeds to value                                                                                                                                                                                                         | Supabase insert                  |
| 17  | Fills value + Enter/blur                   | Creates `image_metadata` row (upsert), appends to metadata list                                                                                                                                                                                                       | Supabase upsert                  |
| 18  | Clicks a chip (chip-type metadata)         | Saves selected chip value immediately — no confirm needed                                                                                                                                                                                                             | Supabase upsert                  |
| 19  | Hovers metadata row                        | Reveals delete icon on the right                                                                                                                                                                                                                                      | CSS hover                        |
| 20  | Clicks delete icon on metadata row         | Removes the metadata entry (optimistic, then Supabase delete)                                                                                                                                                                                                         | Supabase delete                  |
| 21  | Presses Escape during any edit             | Cancels edit, restores original value, no DB write                                                                                                                                                                                                                    | `editingField` → null            |
| 22  | Clicks "Edit location"                     | Enters correction mode (drag marker on map)                                                                                                                                                                                                                           | Correction flow                  |
| 23  | Clicks "Add to project"                    | Opens project picker                                                                                                                                                                                                                                                  | Project assignment               |
| 24  | Clicks "Delete" in actions menu            | Confirmation dialog, then deletes image                                                                                                                                                                                                                               | Supabase delete                  |
| 25  | Scrolls down                               | Reveals more metadata and coordinate info                                                                                                                                                                                                                             | Scroll                           |
| 26  | Clicks Replace Photo button (edit overlay) | Opens file picker; validates file; uploads via direct storage; updates DB `storage_path` + clears `thumbnail_path`; refreshes signed URLs; updates `rawImages` grid cache (clear `thumbnailPath` + `signedThumbnailUrl`); triggers thumbnail re-signing from new file | `replacing` → true, then false   |
| 27  | Replace Photo upload fails                 | Shows inline error below photo; no DB/storage changes                                                                                                                                                                                                                 | `replaceError` set               |

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
│   ├── PhotoColumn                        ← flexible, fills available height
│   │   └── PhotoViewer                    ← object-fit: contain, background: #111
│   │       ├── [not loaded] Placeholder   ← CSS gradient + camera icon + "Loading…"
│   │       ├── [tier 2] ThumbnailPreview  ← 256×256 signed URL (blurred)
│   │       └── [tier 3] FullResImage      ← original res, crossfades over thumbnail
│   └── MetadataColumn                     ← fixed ~320px, max-width: 400px, scrolls independently
│       ├── QuickInfoBar
│       ├── DetailsSection
│       ├── LocationSection
│       ├── MetadataSection
│       └── ActionsSection
│
├── [paneWidth < 640] SingleColumnLayout
│   ├── PhotoViewer                        ← full width, max-height: 55vw
│   └── MetadataContent                   ← max-width: 400px, margin: 0 auto
│       ├── QuickInfoBar
│       ├── DetailsSection
│       ├── LocationSection
│       ├── MetadataSection
│       └── ActionsSection
│
├── QuickInfoBar                           ← horizontal chip row below photo
│   ├── ProjectChip                        ← folder icon + name, filled if assigned
│   ├── DateChip                           ← calendar icon + date, click to edit
│   └── GpsChip                            ← location icon + status, click copies coords
│
├── DetailsSection                         ← dd-section-label "Details"
│   ├── IconPropertyRow "Captured"         ← schedule icon, datetime-local on edit
│   ├── IconPropertyRow "Project"          ← folder icon, <select> dropdown on edit
│   └── IconPropertyRow "Uploaded"         ← cloud_upload icon, read-only, muted
│
├── LocationSection                        ← dd-section-label "Location"
│   ├── IconPropertyRow "Street"           ← signpost icon, text input on edit
│   ├── IconPropertyRow "City"             ← location_city icon, text input on edit
│   ├── IconPropertyRow "District"         ← map icon, text input on edit
│   ├── IconPropertyRow "Country"          ← public icon, text input on edit
│   ├── IconPropertyRow "Coordinates"      ← my_location icon, read-only mono
│   │   └── [corrected] CorrectionBadge
│   └── [corrected] CorrectionHistory      ← original EXIF vs corrected, accent tint
│
├── MetadataSection                        ← dd-section-label "Metadata"
│   ├── [chip type] ChipRow × N           ← key label + inline chip group
│   │   └── ChipGroup                     ← horizontal wrap, single-select, save-on-click
│   │       └── Chip × M                  ← selected: filled --color-primary, unselected: outlined
│   ├── MetadataPropertyRow × N            ← icon + key + value (click-to-edit) + [hover] delete
│   │   └── [editing] InlineInput
│   ├── AddMetadataRow                     ← typeahead key + schema-aware value
│   └── AddMetadataButton                  ← dd-action-row style "+ Add metadata"
│
├── ActionsSection                         ← dd-section-label "Actions", dd-item styled rows
│   ├── EditLocationAction                 ← dd-item: edit_location icon + "Edit location"
│   ├── AddToProjectAction                 ← dd-item: folder_open icon + "Add to project"
│   ├── CopyCoordinatesAction              ← dd-item: content_copy icon + "Copy coordinates"
│   ├── dd-divider
│   └── DeleteAction                       ← dd-item--danger: delete icon + "Delete image"
│
└── [confirm] DeleteConfirmDialog          ← modal with cancel/confirm
```

### MetadataSection — Chip Rows

For metadata entries where `value_type == "chip"`, values render as an inline horizontal chip group instead of a text field:

- Each chip represents one option from `chip_options`
- **Selected chip:** filled background (`--color-primary`), white text
- **Unselected chip:** outlined border (`--color-border`), `--color-text-primary` text
- **Click a chip → saves immediately** (no confirm needed — it's a single-select categorical value)
- On narrow panes, chips wrap to multiple lines
- Clicking an already-selected chip deselects it (clears the value)

### AddMetadataRow — Typeahead Key Selection

The "Add metadata" row is not a simple dual-input. The key field has typeahead suggestions from `metadata_keys`:

```
AddMetadataRow
├── KeyInput                               ← text input, placeholder "Property"
│   └── [typing, ≥ 1 char] KeySuggestionDropdown
│       ├── SuggestionItem × N             ← key_name + type badge ("chip", "date", etc.)
│       └── [no exact match] CreateItem    ← 'Create "{keyInput}"' → new key with type "text"
├── ValueField                             ← rendered based on selected key's schema
│   ├── [chip] ChipGroup                   ← tap to select from chip_options
│   ├── [date] DateInput                   ← <input type="date">
│   ├── [number] NumberInput               ← <input type="number">
│   └── [text / new key] TextInput         ← <input type="text" placeholder="Value">
└── (submit on Enter / blur from value field)
```

**Key field behavior:**

1. User types → query `metadata_keys` where `key_name ILIKE '%{input}%'` (limit 8)
2. Dropdown shows matching keys with a **type badge** (small grey label: "chip", "date", etc.)
3. Selecting a suggestion sets `keyId` and loads the key's `value_type` + `chip_options`
4. If no exact match: "Create \"{input}\"" option creates a new key with `value_type = "text"`
5. After key selection, focus moves to the value field

**Value field rendering** depends on `selectedKeySchema.type`:

- **chip:** renders chip group from `chip_options` — tap to select, skip to submit
- **date:** renders `<input type="date">`
- **number:** renders `<input type="number">`
- **text** (default, also for brand-new keys): renders `<input type="text">`

**Submit:**

1. If `keyId` is null (new key): INSERT into `metadata_keys` with `value_type = "text"`
2. UPSERT into `image_metadata` with the selected/created key
3. Emit the new entry, reset the row

**Keyboard:** Escape cancels, Enter from key field (if chip type) skips to submit, otherwise focuses value field.

## Data

| Field              | Source                                                                                                                     | Type                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Image record       | `supabase.from('images').select('*')`                                                                                      | `ImageRecord`                    |
| Full-res URL       | Supabase Storage signed URL (original, no transform)                                                                       | `string`                         |
| Thumbnail URL      | Supabase Storage signed URL (256×256 transform)                                                                            | `string`                         |
| Placeholder        | CSS-only, no data source                                                                                                   | —                                |
| Metadata           | `supabase.from('image_metadata').select('metadata_key_id, value_text, metadata_keys(key_name, value_type, chip_options)')` | `MetadataEntry[]`                |
| Correction history | `images.latitude` ≠ `images.exif_latitude` (corrected via `coordinate_corrections`)                                        | Coordinate pairs                 |
| Projects list      | `supabase.from('projects').select('id, name').eq('organization_id', orgId)`                                                | `{ id: string, name: string }[]` |

## State

| Name                | Type                             | Default | Controls                                                                |
| ------------------- | -------------------------------- | ------- | ----------------------------------------------------------------------- |
| `image`             | `ImageRecord \| null`            | `null`  | The displayed image record                                              |
| `metadata`          | `MetadataEntry[]`                | `[]`    | Custom metadata key/value pairs (includes `value_type`, `chip_options`) |
| `editingField`      | `string \| null`                 | `null`  | Which field is currently being edited inline                            |
| `fullResLoaded`     | `boolean`                        | `false` | Whether full-res image has loaded                                       |
| `thumbLoaded`       | `boolean`                        | `false` | Whether Tier 2 thumbnail has loaded                                     |
| `loading`           | `boolean`                        | `false` | Whether data is loading from Supabase                                   |
| `error`             | `string \| null`                 | `null`  | Error message if load failed                                            |
| `saving`            | `boolean`                        | `false` | Whether a save operation is in progress                                 |
| `projectOptions`    | `{ id: string, name: string }[]` | `[]`    | Available projects for the dropdown                                     |
| `showAddMetadata`   | `boolean`                        | `false` | Whether the add-metadata row is visible                                 |
| `showContextMenu`   | `boolean`                        | `false` | Context menu visibility                                                 |
| `showDeleteConfirm` | `boolean`                        | `false` | Delete confirmation dialog visibility                                   |
| `paneWidth`         | `number`                         | `0`     | Measured via ResizeObserver on host element (px)                        |

### AddMetadataRow State

| Name                | Type                                           | Default | Controls                                                  |
| ------------------- | ---------------------------------------------- | ------- | --------------------------------------------------------- |
| `keyInput`          | `string`                                       | `''`    | Current text in the key field                             |
| `valueInput`        | `string`                                       | `''`    | Current value (text, selected chip, date…)                |
| `keyId`             | `string \| null`                               | `null`  | UUID of selected existing key (null = new)                |
| `suggestions`       | `MetadataKeySuggestion[]`                      | `[]`    | Matching keys from typeahead query                        |
| `dropdownOpen`      | `boolean`                                      | `false` | Whether key suggestion dropdown is showing                |
| `selectedKeySchema` | `{ type: string, options?: string[] } \| null` | `null`  | Schema of the selected key (drives value field rendering) |

## Progressive Image Loading

The detail view uses a **three-tier progressive loading** strategy to show content as fast as possible:

```mermaid
stateDiagram-v2
    [*] --> Placeholder : View opens, no URL yet
    Placeholder --> Tier2Thumb : Thumbnail signed URL ready
    Tier2Thumb --> Tier3FullRes : Full-res <img> finishes loading
    Tier2Thumb --> Tier2Thumb : Full-res fails → stay on thumbnail
    Placeholder --> Placeholder : Both URLs fail → show "Image unavailable"

    state Placeholder {
        [*] --> GradientWithIcon
        GradientWithIcon : CSS gradient + camera icon
        GradientWithIcon : "Loading..." text
    }

    state Tier2Thumb {
        [*] --> BlurredPreview
        BlurredPreview : 256×256 signed URL
        BlurredPreview : Slight blur applied (CSS filter)
    }

    state Tier3FullRes {
        [*] --> FullImage
        FullImage : Original resolution
        FullImage : Crossfade from blurred thumbnail
    }
```

### Loading Sequence

1. View opens → CSS placeholder shown immediately (no network)
2. Tier 2 thumbnail signed URL fires (`256×256, cover, quality: 60`)
3. Thumbnail `<img>` loads → replaces placeholder with slight blur filter
4. Tier 3 full-res signed URL fires (no transform, or max 2500px)
5. Full-res `<img>` loads in hidden element → crossfade swaps it in
6. If Tier 3 fails, Tier 2 remains visible (adequate quality for metadata editing)
7. If both fail, CSS placeholder stays with "Image unavailable" text

### Signed URL Strategy

- **Tier 2:** `createSignedUrl(thumbnail_path ?? storage_path, 3600, { transform: { width: 256, height: 256, resize: 'cover', quality: 60 } })`
- **Tier 3:** `createSignedUrl(storage_path, 3600)` (no transform — full resolution)

## Inline Editing Flow

All editable fields follow the same interaction pattern:

```mermaid
stateDiagram-v2
    [*] --> ReadOnly : Field displays current value
    ReadOnly --> Editing : User clicks value
    Editing --> Saving : User presses Enter or blurs
    Editing --> ReadOnly : User presses Escape (discard)
    Saving --> ReadOnly : Supabase update succeeds
    Saving --> RollBack : Supabase update fails
    RollBack --> ReadOnly : Restore previous value

    state ReadOnly {
        [*] --> DisplayValue
        DisplayValue : Shows formatted value
        DisplayValue : Dashed underline on hover
    }

    state Editing {
        [*] --> InputActive
        InputActive : Text input (text fields)
        InputActive : datetime-local (captured_at)
        InputActive : select dropdown (project_id)
    }

    state Saving {
        [*] --> Optimistic
        Optimistic : UI shows new value immediately
        Optimistic : Supabase update in background
    }
```

### Editable Fields Map

| Field                    | Input Type                 | DB Table         | DB Column       | Validation                    |
| ------------------------ | -------------------------- | ---------------- | --------------- | ----------------------------- |
| Address label            | `text`                     | `images`         | `address_label` | Max 500 chars                 |
| Captured date            | `datetime-local`           | `images`         | `captured_at`   | Valid ISO date                |
| Project                  | `<select>`                 | `images`         | `project_id`    | Must be valid project ID      |
| Street                   | `text`                     | `images`         | `street`        | Max 200 chars                 |
| City                     | `text`                     | `images`         | `city`          | Max 200 chars                 |
| District                 | `text`                     | `images`         | `district`      | Max 200 chars                 |
| Country                  | `text`                     | `images`         | `country`       | Max 200 chars                 |
| Custom metadata          | `text`                     | `image_metadata` | `value_text`    | Max 1000 chars                |
| Custom metadata (chip)   | chip group (single-select) | `image_metadata` | `value_text`    | Must be one of `chip_options` |
| Custom metadata (date)   | `date`                     | `image_metadata` | `value_text`    | Valid date string             |
| Custom metadata (number) | `number`                   | `image_metadata` | `value_text`    | Valid number                  |

### Metadata Management Flow

```mermaid
sequenceDiagram
    actor User
    participant Detail as ImageDetailView
    participant Supabase

    Note over User,Supabase: Add new metadata entry (typeahead flow)

    User->>Detail: Click "+ Add metadata"
    Detail->>Detail: showAddMetadata.set(true)

    User->>Detail: Type "Flo" in key field
    Detail->>Supabase: SELECT id, key_name, value_type, chip_options<br/>FROM metadata_keys<br/>WHERE org_id = orgId AND key_name ILIKE '%Flo%'<br/>LIMIT 8
    Supabase-->>Detail: [{ id, key_name: "Floor", value_type: "chip", chip_options: ["Ground","1st","2nd","3rd"] }]
    Detail->>Detail: Show suggestion dropdown with type badge

    alt User selects "Floor" suggestion
        User->>Detail: Click "Floor" suggestion
        Detail->>Detail: keyId = id, selectedKeySchema = { type: "chip", options: [...] }
        Detail->>Detail: Render chip group as value field
        User->>Detail: Tap "2nd" chip
        Detail->>Supabase: UPSERT image_metadata(image_id, metadata_key_id, value_text = "2nd")
        Supabase-->>Detail: OK
    else User creates new key "Flooring Type"
        User->>Detail: Type "Flooring Type", click "Create"
        Detail->>Supabase: INSERT INTO metadata_keys(key_name, organization_id, value_type)<br/>VALUES ("Flooring Type", orgId, "text")
        Supabase-->>Detail: { id: newKeyId }
        Detail->>Detail: Render text input as value field
        User->>Detail: Type "Hardwood", press Enter
        Detail->>Supabase: UPSERT image_metadata(image_id, metadata_key_id, value_text = "Hardwood")
        Supabase-->>Detail: OK
    end

    Detail->>Detail: Append to metadata signal, reset AddMetadataRow

    Note over User,Supabase: Chip metadata — inline edit (existing row)

    User->>Detail: Click "1st" chip on existing "Floor" row
    Detail->>Supabase: UPSERT image_metadata SET value_text = "1st"
    Supabase-->>Detail: OK
    Detail->>Detail: Update chip selection state

    Note over User,Supabase: Remove metadata entry

    User->>Detail: Hover row → click delete icon
    Detail->>Detail: Optimistic removal
    Detail->>Supabase: DELETE FROM image_metadata WHERE image_id AND metadata_key_id
    Supabase-->>Detail: OK
```

## File Map

| File                                                              | Purpose                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| `features/map/workspace-pane/image-detail-view.component.ts`      | Detail view component                                   |
| `features/map/workspace-pane/image-detail-view.component.html`    | Template                                                |
| `features/map/workspace-pane/image-detail-view.component.scss`    | Styles                                                  |
| `features/map/workspace-pane/image-detail-view.component.spec.ts` | Unit tests                                              |
| `features/map/workspace-pane/metadata-property-row.component.ts`  | Reusable click-to-edit row                              |
| `features/map/workspace-pane/editable-property-row.component.ts`  | Click-to-edit row for image fields (text, date, select) |

## Wiring

- Displayed inside Workspace Pane when `detailImageId` is set
- On desktop: replaces Thumbnail Grid, back arrow returns to grid
- On mobile: opens as full-screen overlay on top of current view
- Metadata edits call `SupabaseService` to update `image_metadata`
- "Edit location" triggers correction mode in `MapShellComponent`
- Injects `UploadService` for file validation (`validateFile()`) and MIME type constants
- Injects `WorkspaceViewService` to update the grid cache after Replace Photo
- Emits `(imagePropertyChanged)` output when any DB property save succeeds (address, coords, project, captured_at, etc.) — consumed by `MapShellComponent` to update the corresponding marker in real time
- Emits `(imageThumbnailChanged)` output when Replace Photo completes — consumed by `MapShellComponent` to regenerate the marker's DivIcon with the new thumbnail URL

### Replace Photo & Upload Manager

The **Replace Photo** feature (edit icon overlay on the hero photo) currently performs a **direct storage upload + DB update**, bypassing the `UploadManagerService`. This is intentional for now because Replace Photo replaces an _existing_ image's file (same `images` row, new `storage_path`), while the upload manager's `submit()` creates _new_ image rows.

When replacing a photo, the component must:

1. Upload the new file to Supabase Storage at `{org_id}/{user_id}/{uuid}.{ext}`
2. Update the DB: `storage_path = newPath` AND `thumbnail_path = null` (clear stale pre-generated thumbnail)
3. Delete old original file AND old thumbnail from storage (best-effort, after confirmed DB update)
4. Update local `image` signal with new `storage_path` and `thumbnail_path: null`
5. Refresh signed URLs for the detail view
6. Update `WorkspaceViewService.rawImages`: set `storagePath`, clear `thumbnailPath`, `signedThumbnailUrl`, and `thumbnailUnavailable` — so `batchSignThumbnails` generates a new thumbnail from the new file via on-the-fly transform
7. Call `batchSignThumbnails` on the updated image to re-sign immediately

**Future**: When `UploadManagerService` gains a `replaceFile(imageId, file)` method, the detail view should delegate to it for lifecycle resilience, progress tracking, and dedup checking.

## Marker Sync — Live Updates

When the user edits image properties in the detail view and the save succeeds, the corresponding **photo marker on the map must update immediately** without waiting for a viewport refresh or page reload. This ensures the map always reflects the latest state.

### What Changes Propagate

| Property Changed         | Marker Effect                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `address_label`          | Marker tooltip/hover text updates (if shown)                                            |
| `latitude` / `longitude` | Marker **moves** to the new coordinates via `marker.setLatLng()`                        |
| `project_id`             | No direct marker visual change (marker doesn't show project)                            |
| `captured_at`            | No direct marker visual change                                                          |
| `direction`              | Direction cone angle updates                                                            |
| `storage_path` (Replace) | Marker thumbnail regenerates — new signed URL, DivIcon HTML rebuilt via `setIcon()`     |
| Address fields (street…) | Marker grouping may change if workspace groups by address — viewport query handles this |

### Event Flow

```mermaid
sequenceDiagram
  actor User
  participant Detail as ImageDetailView
  participant Shell as MapShellComponent
  participant Map as Leaflet Map
  participant DB as Supabase

  User->>Detail: Edit address label inline
  Detail->>DB: UPDATE images SET address_label = 'New Label'
  DB-->>Detail: OK (optimistic already applied)

  Detail->>Shell: (imagePropertyChanged) {imageId, field: 'address_label', value: 'New Label'}
  Shell->>Shell: Find marker by imageId in uploadedPhotoMarkers
  Shell->>Shell: Update marker's cached data (addressLabel)
  Note over Shell: No visual change needed for address-only edit

  User->>Detail: Click "Edit location" → drag marker
  Detail->>DB: INSERT coordinate_corrections; UPDATE images SET latitude, longitude
  DB-->>Detail: OK

  Detail->>Shell: (imagePropertyChanged) {imageId, field: 'coordinates', value: {lat, lng}}
  Shell->>Shell: Find marker by imageId
  Shell->>Map: marker.setLatLng([newLat, newLng])
  Shell->>Shell: Update markerKey mapping (old coords → new coords)
  Note over Map: Marker slides to new position

  User->>Detail: Replace photo file
  Detail->>DB: UPDATE images SET storage_path, thumbnail_path = null
  DB-->>Detail: OK

  Detail->>Shell: (imageThumbnailChanged) {imageId, newStoragePath, localObjectUrl}
  Shell->>Shell: Find marker by imageId
  Shell->>Shell: Set marker thumbnail to localObjectUrl (instant)
  Shell->>Map: marker.setIcon(rebuiltDivIcon)
  Note over Map: Marker shows new photo immediately
```

### Implementation Approach

The detail view emits **two output events** that the parent (`MapShellComponent` via `WorkspacePaneComponent`) bubbles up:

1. **`(imagePropertyChanged)`** — emitted on every successful property save:

   ```typescript
   interface ImagePropertyChangedEvent {
     imageId: string;
     field: string; // 'address_label' | 'latitude' | 'longitude' | 'captured_at' | 'direction' | 'project_id' | 'street' | 'city' | ...
     value: unknown; // The new value
     coords?: { lat: number; lng: number }; // Set when field is coordinates
   }
   ```

2. **`(imageThumbnailChanged)`** — emitted when Replace Photo completes:
   ```typescript
   interface ImageThumbnailChangedEvent {
     imageId: string;
     newStoragePath: string;
     /** Local ObjectURL for immediate marker display (avoids signed-URL round trip). */
     localObjectUrl?: string;
   }
   ```

`MapShellComponent` handles these events by:

- Looking up the `L.Marker` instance in `uploadedPhotoMarkers` (keyed by imageId or markerKey)
- For coordinate changes: calling `marker.setLatLng()` and updating the key mapping
- For thumbnail changes: rebuilding the DivIcon HTML via `buildPhotoMarkerHtml()` with the new `localObjectUrl` and calling `marker.setIcon()`
- For other property changes: updating the cached marker data (no DOM change unless the property affects rendering)

### Correction Mode Integration

When the user starts "Edit location" from the detail view:

1. Detail emits `(editLocationRequested)` with the imageId
2. Map Shell enters correction mode — marker becomes draggable
3. User drags marker to new position and confirms
4. Map Shell writes the correction to `coordinate_corrections` and updates `images.latitude` / `images.longitude`
5. Map Shell emits the new coords back to Detail via a shared signal or callback
6. Detail refreshes its `image` signal to show updated GPS row
7. The marker is already at the new position from the drag — no additional move needed

## Acceptance Criteria

### Toolbar & Layout

- [ ] Workspace toolbar (operators) is **hidden** when detail view is open
- [ ] Workspace toolbar reappears when detail view closes (back to grid)
- [ ] Uses `ResizeObserver` on host element to measure pane width (not `window.innerWidth`)
- [ ] Wide pane (≥ 640px): two-column grid — photo left (flexible), metadata right (~320px fixed)
- [ ] Narrow pane (< 640px): single-column stack — photo on top, metadata below
- [ ] Detail container capped at 900px max-width, centered via `margin: 0 auto`
- [ ] Metadata content area capped at **400px max-width** — centers in available space
- [ ] Photo viewer: wide layout uses `object-fit: contain`, `max-height: calc(100vh - 60px)`, `background: #111`
- [ ] Photo viewer: narrow layout uses full width, `max-height: 55vw`, `object-fit: contain`
- [ ] Metadata column scrolls independently from photo column in wide layout

### Quick Info Bar

- [ ] Horizontal chip row below photo with Project, Date, GPS chips
- [ ] Project chip: filled `--color-primary` when assigned, outlined when empty
- [ ] Date chip: calendar icon + formatted date, click enters date edit
- [ ] GPS chip: `--color-success` tint with coordinates, `--color-warning` if missing GPS
- [ ] Chips use `rounded-full`, `--text-caption` size, compact padding
- [ ] Chips wrap on narrow panes

### Visual Design — Property Rows

- [ ] All property rows have **leading Material icon** (1rem, `--color-text-secondary`)
- [ ] Row hover uses **warm clay tint** (`color-mix(in srgb, var(--color-clay) 8%, transparent)`)
- [ ] Hover reveals **edit pencil icon** on right (hidden at rest, like dd-drag-handle)
- [ ] Row geometry follows dd-item pattern: `gap: --spacing-2`, `padding: --spacing-1 --spacing-2`, `--radius-sm`
- [ ] Section headings use **dd-section-label** style: `0.6875rem`, uppercase, `600`, `--color-text-disabled`
- [ ] Read-only rows (Location, Uploaded) show muted value text, no edit icon on hover

### Visual Design — Actions Section

- [ ] Actions use **dd-item** button styling (not bordered outline buttons)
- [ ] Each action: leading icon + label text, `0.8125rem` font
- [ ] Hover uses warm clay tint matching all dropdown items
- [ ] Delete action uses `dd-item--danger` style (red icon + label)
- [ ] `dd-divider` separates destructive actions from normal ones

### Navigation

- [ ] Desktop: replaces grid in workspace pane, back arrow returns
- [ ] Mobile: full-screen overlay with close button

### Progressive Image Loading

- [ ] CSS placeholder shown immediately when view opens (gradient + camera icon)
- [ ] Tier 2 thumbnail (256×256 transform) loads and replaces placeholder with slight blur
- [ ] Full-res image loads on demand and crossfades over blurred thumbnail
- [ ] If full-res fails, Tier 2 thumbnail stays visible
- [ ] If both tiers fail, CSS placeholder with "Image unavailable" text remains
- [ ] No broken `<img>` icon ever shown

### Inline Editing

- [ ] **Address label**: click title → inline text input → save on Enter/blur → updates `images.address_label`
- [ ] **Captured date**: click value → `datetime-local` input → save → updates `images.captured_at`
- [ ] **Project**: click value → `<select>` dropdown → save → updates `images.project_id`
- [ ] **Street/City/District/Country**: click value → inline text input → save → updates `images.[field]`
- [ ] Escape key cancels any active edit without saving
- [ ] Optimistic updates: UI reflects changes immediately, rolls back on error
- [ ] All editable rows show dashed underline hover affordance

### Custom Metadata — Text/Date/Number Types

- [ ] **Custom metadata**: click value → inline edit → save on Enter/blur via upsert
- [ ] **Remove metadata**: hover row → delete icon → removes `image_metadata` row (optimistic + Supabase)

### Custom Metadata — Chip Type

- [ ] Chip-type metadata renders as inline horizontal chip group (not a text field)
- [ ] Selected chip: filled `--color-primary` background, white text
- [ ] Unselected chips: outlined border, `--color-text-primary` text
- [ ] Clicking a chip saves immediately (no confirm dialog)
- [ ] Clicking the already-selected chip deselects (clears value)
- [ ] Chips wrap on narrow panes

### Add Metadata — Typeahead Flow

- [ ] Key field shows suggestions from `metadata_keys` (ILIKE match, limit 8)
- [ ] Suggestions appear after ≥ 1 character typed
- [ ] Each suggestion shows key name + type badge ("chip", "date", "number", "text")
- [ ] Selecting a suggestion loads the key's `value_type` and `chip_options`
- [ ] Value field renders based on selected key's schema (chip group / date / number / text)
- [ ] If no exact match: "Create \"{input}\"" option appears, creates key with `value_type = "text"`
- [ ] New key auto-created on submit if `keyId` is null
- [ ] Submit upserts `image_metadata` row
- [ ] Escape cancels the add-metadata row
- [ ] Enter from key field: if chip type → skip to submit; else → focus value field

### Other

- [ ] Coordinates displayed with correction indicator if corrected
- [ ] Original EXIF coordinates shown when correction exists (Honesty principle)
- [ ] Edit location button starts marker correction mode
- [ ] Add to project opens project picker
- [ ] Delete confirmation before removal
- [ ] Projects dropdown loads from `projects` table filtered by `organization_id`

### Replace Photo

- [x] Edit icon overlay on hero photo opens file picker
- [x] File validated before upload (size + MIME type via `UploadService.validateFile()`)
- [x] New file uploaded to Supabase Storage; DB `storage_path` updated
- [x] DB `thumbnail_path` cleared to `null` (stale pre-generated thumbnail invalidated)
- [x] Old original AND old thumbnail deleted from storage (best-effort)
- [x] Detail view refreshes signed URLs → shows new photo immediately
- [x] Grid cache (`rawImages`) updated: `thumbnailPath` cleared so `batchSignThumbnails` generates thumbnail from new file
- [x] Spinner shown on button during upload; error shown inline below photo on failure
- [ ] **Future**: Delegate to `UploadManagerService.replaceFile()` for lifecycle resilience and dedup

### Marker Sync — Live Updates

- [ ] Emits `(imagePropertyChanged)` on every successful inline edit (address_label, captured_at, project_id, street, city, district, country)
- [ ] Emits `(imageThumbnailChanged)` when Replace Photo completes with new `storagePath` + `localObjectUrl`
- [ ] Coordinate edit (via "Edit location" correction mode) moves the marker on the map in real time via `marker.setLatLng()`
- [ ] Replace Photo updates the marker thumbnail immediately using the local `ObjectURL` (no signed-URL delay)
- [ ] Direction change (if editable in future) updates the direction cone angle on the marker
- [ ] Events bubble through `WorkspacePaneComponent` to `MapShellComponent`
- [ ] Map marker state stays in sync with detail view — no stale data after edits
