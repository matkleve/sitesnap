# Sitesnap – Design Tokens

Load this file for any task involving visual styling, sizing, or color.

## 3.1 Color Tokens

Design tokens are CSS custom properties. All components use tokens — never raw hex or Tailwind arbitrary values in design-sensitive contexts.

### Semantic token hierarchy

| Token                    | Light value | Dark value | Usage                                                                                  |
| ------------------------ | ----------- | ---------- | -------------------------------------------------------------------------------------- |
| `--color-bg-base`        | `#F9F7F4`   | `#0F0E0C`  | Page/app background — warm off-white / warm near-black                                 |
| `--color-bg-surface`     | `#FFFFFF`   | `#1A1917`  | Panels, sidebar, workspace pane                                                        |
| `--color-bg-elevated`    | `#FFFFFF`   | `#252320`  | Dropdowns, tooltips, modal overlays                                                    |
| `--color-bg-map`         | — (tile)    | — (tile)   | Map canvas; tile URL swaps on dark mode                                                |
| `--color-border`         | `#E8E4DE`   | `#2E2B27`  | Panel borders, dividers — warm-tinted                                                  |
| `--color-border-strong`  | `#C8C1B8`   | `#3D3830`  | Inputs, focused borders                                                                |
| `--color-text-primary`   | `#1A1714`   | `#EDEBE7`  | Headlines, body, labels — warm near-black / warm near-white                            |
| `--color-text-secondary` | `#6B6259`   | `#908880`  | Subtext, timestamps, metadata labels                                                   |
| `--color-text-disabled`  | `#A89E95`   | `#4A4540`  | Disabled states                                                                        |
| `--color-primary`        | `#CC7A4A`   | `#D9895A`  | Primary actions, active markers, focus rings                                           |
| `--color-primary-hover`  | `#B8663A`   | `#E89A6E`  | Hover state for primary                                                                |
| `--color-success`        | `#16A34A`   | `#22C55E`  | Upload success, confirmed correction                                                   |
| `--color-warning`        | `#C2610A`   | `#F59E0B`  | Missing GPS, low-confidence EXIF                                                       |
| `--color-danger`         | `#DC2626`   | `#EF4444`  | Upload error, deletion confirmation                                                    |
| `--color-accent`         | `#7C3AED`   | `#A78BFA`  | Named group tabs, badge accents                                                        |
| `--color-clay`           | `#CC7A4A`   | `#D9895A`  | Upload CTA, active selection emphasis — Anthropic-inspired warm accent; used sparingly |

**Map marker colors (semantic):**

| State          | Color token                                             | Meaning                            |
| -------------- | ------------------------------------------------------- | ---------------------------------- |
| Default        | `--color-primary`                                       | Normal EXIF-placed image           |
| Corrected      | `--color-accent`                                        | Marker has been manually corrected |
| Selected       | `#FFFFFF` with primary ring                             | Currently active/selected marker   |
| Pending upload | `--color-clay`                                          | In upload queue, not yet saved     |
| Error          | `--color-danger`                                        | Upload failed                      |
| Cluster        | `--color-bg-elevated` with `--color-text-primary` badge | Aggregated cluster                 |

All markers use a **2px solid white outline** (`stroke: #FFFFFF; stroke-width: 2`) and a `drop-shadow(0 1px 3px rgba(0,0,0,0.45))`. This ensures legibility on any tile background — street tiles, dark matter tiles, and satellite imagery alike (Eleken principle: always test markers against the darkest and brightest backgrounds you will encounter).

#### Tile styling

The default OSM tile is never shipped unstyled. Strip the following from the base tile configuration:

- Restaurant, cafe, hotel, and retail POI icons
- Tourist attraction markers
- Parking and transit symbols (unless in a zone with heavy construction logistics)
- Decorative park and landuse labels

Keep:

- Road network (all levels, muted stroke)
- Building footprints (muted warm fill)
- Water bodies, green areas (muted, desaturated)
- Address labels at zoom ≥ 15
- Motorway and primary road labels at all zoom levels

For MVP: use CartoDB Light (Positron) in light mode — already significantly cleaner than stock OSM. Apply full custom brand tile style post-MVP (see `docs/design.md`, Design Debt item 3).

#### Dark mode tile layers

- **Light mode:** CartoDB Positron (clean, minimal, light) — `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- **Dark mode:** CartoDB Dark Matter — `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Dark mode alternative:** Stadia Alidade Smooth Dark — `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png`

The tile URL is set by `MapAdapter.setTileStyle('light' | 'dark')` and changes when `ThemeService` emits a theme change event.

## 3.2 Typography

All text is set in the system sans-serif stack unless the brand acquires a custom typeface. The stack prioritizes native fonts for performance on field devices:

```
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

**Type scale (rem, base 16px):**

| Role      | Token            | Size             | Weight | Line-height | Usage                                      |
| --------- | ---------------- | ---------------- | ------ | ----------- | ------------------------------------------ |
| Display   | `--text-display` | 1.5rem (24px)    | 600    | 1.3         | Panel headings, empty state titles         |
| Heading 1 | `--text-h1`      | 1.25rem (20px)   | 600    | 1.35        | Group tab names, modal headers             |
| Heading 2 | `--text-h2`      | 1rem (16px)      | 600    | 1.4         | Section labels, filter group headers       |
| Body      | `--text-body`    | 0.9375rem (15px) | 400    | 1.55        | Descriptions, metadata values, form labels |
| Small     | `--text-small`   | 0.8125rem (13px) | 400    | 1.5         | Timestamps, subtitles, secondary labels    |
| Caption   | `--text-caption` | 0.75rem (12px)   | 400    | 1.4         | Badge text, cluster counts, hints          |
| Mono / ID | `--text-mono`    | 0.8125rem (13px) | 400    | 1.4         | Coordinates, UUIDs, file names             |

Minimum rendered text size: **12px / 0.75rem** (caption only). Body text is never below 15px.

## 3.3 Spacing and Grid

Sitesnap uses a **0.25rem (4px) base unit** with a Tailwind-standard scale (0.25rem, 0.5rem, 0.75rem, 1rem, 1.25rem, 1.5rem, 2rem, 2.5rem, 3rem, 4rem, 5rem, 6rem).

Key layout dimensions:

| Element                          | Value                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| Sidebar width (collapsed)        | 48px (3rem)                                                                |
| Sidebar width (expanded)         | 240px (15rem)                                                              |
| Workspace pane width (default)   | 360px (22.5rem)                                                            |
| Workspace pane width (min)       | 280px (17.5rem)                                                            |
| Workspace pane width (max)       | 640px (40rem)                                                              |
| Top toolbar height               | 56px (3.5rem)                                                              |
| Bottom sheet (min / half / full) | 64px (4rem) / 50vh / 100vh                                                 |
| Map padding (viewport pre-fetch) | 10% on each edge                                                           |
| Filter panel width (desktop)     | 280px (17.5rem)                                                            |
| Thumbnail size (grid)            | 128×128px (px intentional — image display size should not scale with font) |
| Thumbnail size (list)            | 64×64px (px intentional — image display size should not scale with font)   |
| Tap target minimum (mobile)      | 3rem × 3rem (48×48px)                                                      |
| Tap target minimum (desktop)     | 2.75rem × 2.75rem (44×44px)                                                |

**Interactive element heights (Notion-inspired compact density):**

Pointer targets always meet the 2.75rem × 3rem (44×48px) minimum via CSS `padding` — the _visual_ height of the element may be smaller. This lets the interface carry more information per row without sacrificing accessibility.

| Size      | Visual height  | Token class    | Usage                                                                      |
| --------- | -------------- | -------------- | -------------------------------------------------------------------------- |
| `compact` | 1.75rem (28px) | `.btn-compact` | Workspace pane inline micro-actions, command palette results, tab chips    |
| `default` | 2rem (32px)    | `.btn-default` | Filter panel controls, panel buttons, dropdown items                       |
| `large`   | 2.5rem (40px)  | `.btn-large`   | Primary CTAs ("Confirm upload", "Save correction"), toolbar action buttons |
| FAB       | 3.5rem (56px)  | `.btn-fab`     | Mobile upload trigger (fixed, bottom-right)                                |

Ghost buttons (the default for secondary/tertiary actions) have no background or border at rest. A `--color-bg-elevated` fill at 35–45% opacity appears on hover over 80ms. Filled buttons (primary CTAs only) use `--color-primary` fill and `--color-text-on-primary` label.

### Shared layout primitives

Use the shared primitives in `apps/web/src/styles.scss` before inventing custom panel or row shells.

| Primitive                | Role                                                                                | Default geometry                                                                            | Rules                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `.ui-container`          | Shared panel shell for sidebar, search surfaces, upload panel, and similar overlays | Panel radius `--container-radius-panel`, panel padding tokens, panel gap token              | Defines the outer geometry boundary. Sidebar, Search Bar, Upload Panel, Filter Panel, and future panels should all start from this same shell. |
| `.ui-container--compact` | Compact container variant                                                           | Uses compact inline/block padding tokens                                                    | Use when the surface needs denser internal spacing without changing outer corners.                                                             |
| `.ui-item`               | Shared row/item shell for nav rows, dropdown items, search results, and menu rows   | Fixed leading media column, flexible label column, control radius, token-driven padding/gap | Row geometry is stable across states. Do not animate padding, row height, icon column width, or gap.                                           |
| `.ui-item-media`         | Fixed leading media column                                                          | `2rem` (32px) square by default                                                             | Width stays fixed while labels, subtitles, or meta text change.                                                                                |
| `.ui-item-label`         | Flexible label/meta column                                                          | Stacks primary text and optional secondary text                                             | Use clipping/ellipsis for overflow rather than changing the row shell.                                                                         |
| `.ui-spacer`             | Flex spacer in vertical layouts                                                     | `flex: 1 1 auto`                                                                            | Use to push footer/account/actions to the end of a vertical container instead of hard-coded margins.                                           |

Primitive invariants:

- Sidebar is the reference implementation for `.ui-container`, `.ui-item`, and `.ui-spacer`.
- Search Bar uses `.ui-container` with the same panel corners as the sidebar, not a rounded-pill radius change between idle/open states.
- Sidebar, Search Bar, Upload Panel, and similar panel surfaces should share the same panel padding and gap tokens so alignment starts from a common boundary.
- Panel shells use explicit padding tokens (`--container-padding-inline-panel`, `--container-padding-block-panel`) and a dedicated panel gap token (`--container-gap-panel`).
- If a pill treatment causes transition instability, keep the standard panel radius in all states.
- Visual state changes may affect color, opacity, clipping, and outer container width or height. They must not change row geometry.

## 3.4 Border Radius

The UI uses a consistent "friendly but professional" radius system:

| Element                       | Radius                   |
| ----------------------------- | ------------------------ |
| Cards, panels, workspace pane | `rounded-xl` (12px)      |
| Buttons, inputs, dropdowns    | `rounded-lg` (8px)       |
| Chips, badges, tags           | `rounded-full`           |
| Thumbnails in grid            | `rounded-md` (6px)       |
| Map overlays / floating cards | `rounded-xl` with shadow |
| Modals                        | `rounded-2xl` (16px)     |

## 3.5 Shadows and Elevation

### Physical shadow scale

Four physical shadows plus a focus ring. Components never use these directly — they use the semantic elevation layers below.

| Token            | Light mode value                                                      | Purpose                              |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `--shadow-sm`    | `0 1px 3px rgba(15,14,12,.12), 0 1px 2px rgba(15,14,12,.08)`          | Lightest lift                        |
| `--shadow-md`    | `0 4px 12px rgba(15,14,12,.15), 0 2px 4px rgba(15,14,12,.10)`         | Standard overlay                     |
| `--shadow-lg`    | `0 8px 24px rgba(15,14,12,.18), 0 4px 8px rgba(15,14,12,.12)`         | Dropdown/popover                     |
| `--shadow-xl`    | `0 16px 48px rgba(15,14,12,.22), 0 6px 16px rgba(15,14,12,.14)`       | Modal-level                          |
| `--shadow-focus` | `0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent)` | Focus ring (semantic, not elevation) |

In dark mode, `sm` through `xl` are overridden with `rgba(0,0,0,...)` at higher opacity so shadows remain visible against dark surfaces. `--shadow-focus` adapts automatically via `--color-primary`.

### Elevation layers (semantic)

Every component's `box-shadow` references a semantic `--elevation-*` token. Elements at the **same visual plane share the same layer** — this ensures the sidebar, search bar, upload FAB, GPS button, and map markers all look like they float at the same height.

| Layer                  | Maps to       | Elements                                                                                                                                    |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--elevation-base`     | `none`        | Page background, flush surfaces                                                                                                             |
| `--elevation-subtle`   | `--shadow-sm` | Mobile bottom bar, drag divider (rest), location marker rings                                                                               |
| `--elevation-overlay`  | `--shadow-md` | **All map-level overlays**: sidebar, search bar, upload FAB, GPS button, placement banner, toast, upload panel, workspace pane, photo panel |
| `--elevation-dropdown` | `--shadow-lg` | Context menus, popovers, toolbar dropdowns (sort/group/filter), auth card                                                                   |
| `--elevation-modal`    | `--shadow-xl` | Delete confirmation dialog, image detail overlay, drag preview                                                                              |

**Rule**: if two elements visually sit at the same plane, they must use the same `--elevation-*` layer. To change the shadow for an entire visual plane, update the alias in `:root` — every element on that plane updates together.

**Photo marker drop shadow** (`--photo-marker-drop-shadow`) is a separate token: it uses `filter: drop-shadow(...)` so it traces the SVG/image shape rather than the bounding box. Light: `rgba(15,14,12,0.45)`. Dark: `rgba(0,0,0,0.65)`.

## 3.6 Iconography

Use a single coherent icon set throughout. Standard for this project: **Material Icons / Material Symbols only**. Do not mix icon libraries.

Icon sizing conventions:

- Toolbar / navigation: 1.25rem (20px)
- Inline with text: 1rem (16px)
- Large actions (FAB, empty states): 2rem–2.5rem (32–40px)
- Map markers: custom SVG (not icon font)

All interactive icons must have a visible label or a `title` / `aria-label` attribute for accessibility.
