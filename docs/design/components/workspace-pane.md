# GeoSite – Component: Workspace Pane

## 5.3 Workspace Pane — Group Tabs

### Workspace Pane Architecture

```mermaid
flowchart TD
    subgraph WorkspacePane["Workspace Pane (Right Panel)"]
        direction TB
        TH["Tab Header — scrollable row"] --> AS["Active Selection tab\n(pinned left, ephemeral)\nIcon: crosshair"]
        TH --> G1["Named Group 1"]
        TH --> G2["Named Group 2"]
        TH --> GN["… more groups"]
        TH --> PLUS["+  New Group"]

        AS --> GALLERY["Thumbnail Gallery\n128×128px grid (px intentional — image display size should not scale with font)"]
        GALLERY --> SORT["Sort: Date ↓ · Date ↑\nDistance · Name"]
    end

    subgraph ThumbnailCard["Thumbnail Card Anatomy"]
        direction TB
        IMG["128×128 thumbnail\nobject-cover, rounded-md"] --> BL["Bottom-left: capture date\n--text-caption on dark scrim"]
        IMG --> BR["Bottom-right: project badge\ncolored chip"]
        IMG --> TR["Top-right: metadata preview\nsingle key=value"]
        IMG --> CD["Correction dot\n--color-accent (if corrected)"]
    end

    subgraph HoverReveals["Hover-to-Reveal Controls (Notion pattern)"]
        direction LR
        CB["☑ Selection checkbox\ntop-left, 1rem (16px)"] --- CTX["⋯ Context menu\ntop-right, .btn-compact"]
        CTX --- MICRO["Floating micro-toolbar\nabove card, 0.25rem (4px) gap\n'Add to group' · 'View detail'"]
    end
```

The workspace pane header is a scrollable tab row. Tab types:

- **Active Selection** (pinned left, ephemeral): shows images from the current radius selection or marker interaction. Icon: crosshair. Cannot be renamed or closed.
- **Named group tabs** (scrollable): user-created groups. Each tab shows a group name. Long-press → rename/delete context menu.

Tab overflow: if more than 5 named groups exist, tabs become horizontally scrollable. A "+" button at the right end of the tab row creates a new group.

Within each tab, the gallery is a responsive masonry or fixed-grid of thumbnail cards:

**Thumbnail card:**

- 128×128px thumbnail (px intentional — image display size should not scale with font), `rounded-md` corners.
- Bottom-left: capture date in `--text-caption` on a semi-transparent dark scrim.
- Bottom-right: project badge (short name, colored chip in `--color-accent` or project-assigned color).
- Top-right: metadata preview (single key=value shorthand, e.g., "Beton") — visible at rest.
- Correction dot: top-right edge, `--color-accent`, visible at rest. This is an honest state indicator (Principle 1.7) and is never hidden.

**Hover-to-reveal controls (Notion pattern — Principle 1.8):** The following appear via `opacity: 0 → 1` at 80ms on mouse-enter. No layout shift — space is always reserved.

- **Selection checkbox** (top-left corner, 1rem / 16px). Always visible in bulk-select mode.
- **Context menu `⋯` button** (top-right, replaces the metadata preview on hover). A `.btn-compact` (1.75rem / 28px) ghost button. Opens a popup with: "Add to group", "Edit metadata", "Delete", "Copy coordinates".
- **Floating micro-toolbar** — appears centered directly above the card (0.25rem / 4px gap): compact ghost buttons for "Add to group" and "View detail". Dismisses when cursor leaves the card.

On mobile, hover states are replaced with a long-press (500ms haptic) that activates bulk-select mode and reveals the selection checkbox.

Sorting controls (above the gallery): "Date ↓", "Date ↑", "Distance from map center", "Name". Compact segmented control, `.btn-compact` height.
