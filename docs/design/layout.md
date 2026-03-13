# Feldpost – Layout System

Load this file for any task involving breakpoints, panel dimensions, or responsive behavior.

## 4. Layout System

### Shared layout primitives

The design system has three shared layout primitives that should be reused before creating custom panel or row geometry.

#### `.ui-container`

- Standard panel shell for floating and docked surfaces such as the Sidebar, Search Bar, search dropdown surface, and Upload Panel.
- Uses panel corners via `--container-radius-panel`.
- Defines the alignment boundary that child rows inherit.
- Uses shared panel padding and gap tokens by default: `--container-padding-inline-panel`, `--container-padding-block-panel`, and `--container-gap-panel`.
- Components may override padding and gap through `--ui-container-*` variables only when the surface genuinely needs a different density. Panel-like surfaces should keep the shared geometry.

#### `.ui-item`

- Standard row shell for navigation rows, dropdown items, search results, and future menu/list items.
- Structure:

```text
.ui-item
├── .ui-item-media
└── .ui-item-label
```

- `.ui-item-media` is a fixed-width leading column.
- `.ui-item-label` is the flexible text/meta column.
- Row padding, media width, label gap, and row height stay stable during hover, active, expanded, and loading states.

#### `.ui-spacer`

- Standard flex spacer for vertical panel layouts.
- Use to push account rows, footer actions, or terminal controls to the bottom of a container.

Layout stability rules:

- The Search Bar uses the same outer corner radius as the Sidebar.
- Sidebar, Search Bar, Upload Panel, Filter Panel, and future panel surfaces share the same `.ui-container` alignment boundary.
- Search results are revealed inside the same `ui-container` surface; the container does not morph into or out of a pill and the results panel should not behave like a detached floating dropdown.
- If a decorative shape introduces transition artifacts or unstable geometry, remove the decorative shape and keep the primitive geometry intact.

### Layout Overview — All Breakpoints

```mermaid
flowchart TB
    subgraph Desktop["Desktop ≥ 1024px (64rem)"]
        direction LR
        DS["Sidebar\n48px (3rem)–240px (15rem)"] --- DM["Map Pane\n(fills remaining)"]
        DM --- DW["Workspace Pane\n360px (22.5rem, resizable)"]
        DT["Top Toolbar 56px (3.5rem)"] -.-> DM
        DF["Filter Panel\nSlides from top-right\nOver map"] -.-> DM
    end

    subgraph Tablet["Tablet 768–1023px (48rem–63.9375rem)"]
        direction LR
        TS["Icon-only\nSidebar 48px (3rem)"] --- TM["Map\n(full width)"]
        TM --- TW["Workspace\nSlide-over drawer"]
        TF["Filter sheet\nFull-width from top"] -.-> TM
    end

    subgraph Mobile["Mobile < 768px (48rem)"]
        direction TB
        MSB["Search bar — always top"] --- MM["Map — full bleed"]
        MM --- MFAB["Upload FAB\n3.5rem (56px), bottom-right"]
        MM --- MBS["Bottom Sheet\nmin 4rem (64px) · half 50vh · full 100vh\n(drag handle)"]
    end
```

### 4.1 Desktop Layout (≥ 1024px / 64rem)

```
┌──────────────────────────────────────────┬──┬───────────────────────┐
│         ┌─────────────────────┐          │  │                       │
│         │      Search Bar     │          │  │   Workspace Pane      │
│         └─────────────────────┘          │  │   22.5rem default     │
│  [Side]                                  │◀▶│                       │
│  [bar ]        Map Pane                  │  │   [Group Tabs]        │
│  [left]        (flex: 1)                 │  │   [Thumbnail Gallery] │
│  [mid ]                                  │  │   [Detail View]       │
│                                          │  │                       │
└──────────────────────────────────────────┴──┴───────────────────────┘
```

- Desktop layout is a horizontal split container with two structural siblings: **Map Pane** and **Workspace Pane**.
- A draggable vertical divider sits between the panes and controls workspace resizing.
- Workspace pane default width is 22.5rem (360px); minimum width is 17.5rem (280px).
- There is no fixed maximum workspace width. Instead, divider movement is constrained by a minimum map-width rule: the divider cannot move further left once the map pane would shrink below a safe interaction width of approximately 20rem (320px).
- The map pane uses `flex: 1` and absorbs all remaining horizontal space after workspace width and divider position are resolved.
- The **Sidebar** and **Search Bar** are positioned inside the map pane as floating component-level elements, not as separate layout columns. Their behavior and dimensions are defined in [docs/element-specs/sidebar.md](docs/element-specs/sidebar.md) and [docs/element-specs/search-bar.md](docs/element-specs/search-bar.md).
- This layout section defines pane structure and resizing only; component behavior belongs in the component specifications.

### 4.2 Tablet Layout (768–1023px / 48rem–63.9375rem)

- Sidebar collapses to icon-only (48px / 3rem). Long-press or swipe-right reveals a temporary overlay sidebar.
- Workspace pane becomes a slide-over drawer (right edge), triggered by a FAB or tab at the right edge of the screen.
- Filter panel opens as a full-width sheet from the top.
- Map occupies full width when workspace is dismissed.

### 4.3 Mobile Layout (< 768px / 48rem)

```
┌────────────────────────────────┐
│  Search bar (top, always)      │
├────────────────────────────────┤
│                                │
│         Map (full bleed)       │
│                                │
│                                │
│   [Upload FAB — bottom right]  │
├────────────────────────────────┤
│  Bottom Sheet                  │
│  ─────────── (drag handle)     │
│  Snap: minimized / half / full │
└────────────────────────────────┘
```

- Bottom sheet contains the Active Selection tab and named groups.
- Filter access: tapping the filter icon in the search bar opens a modal bottom sheet (does not compete with the workspace bottom sheet).
- Image detail: tapping a marker expands the bottom sheet to half-height, showing thumbnail + core metadata. Tapping again or swiping up goes full-screen detail.
- The Upload FAB is a 3.5rem (56px) circle, fixed to the bottom-right, above the bottom sheet handle.
