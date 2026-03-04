# GeoSite – Product Design

**Who this is for:** designers, frontend engineers, and anyone shaping how GeoSite looks and behaves.  
**What you'll get:** a complete design reference — principles, visual language, layout system, component patterns, motion, and reference products.

See `features.md` for capability scope, `use-cases.md` for user flows, and `architecture.md` for technical constraints that affect layout decisions.

---

## 1. Design Principles

These principles filter every design decision. When choices conflict, this order resolves the tie. Principles 1–4 govern utility; principles 5–7 govern character and feel.

### 1.1 Field-First

The technician using this app in direct sunlight, with dirty gloves, at arm's length is the hardest user to serve. If a UI element works for them, it works for everyone. Consequences:

- Tap targets ≥ 48 × 48 px on mobile, ≥ 44 × 44 px on desktop.
- High-contrast labels; do not rely on color alone to convey state.
- Critical actions (confirm upload, save correction) require only one tap after review — no buried confirmation flows.

### 1.2 Map is the Primary Canvas

The map is not a support feature. It is the main interface. All other panels — filters, workspace, detail views — exist to serve the map interaction. Consequences:

- The map is never fully occluded on any breakpoint during normal use.
- Panels animate in over the map (overlay/sheet) rather than pushing it aside on smaller screens.
- The map retains its position, zoom, and state when panels open or close.
- **The base tile is always styled** — default OSM tiles are never shipped as-is. Irrelevant POIs (restaurants, ATMs, tourist labels) are suppressed; only roads, building footprints, and water bodies relevant to construction navigation are kept. This is not cosmetic — it is a direct cognitive-load reduction. The product's own data layer (photo markers) must be the most visually prominent thing on the map at all times (Eleken: strip noise, prioritize your data).

### 1.3 Progressive Disclosure

Show only what the user needs for the task at hand. Complexity surfaces on demand. Consequences:

- Thumbnails before full-resolution images.
- Collapsed filter panel by default; expand on demand.
- Detail metadata shown inline but collapsed; expand on tap.
- Batch and advanced actions in context menus, not in primary toolbar.
- **Zoom-level intelligence:** markers reveal progressively more detail as the user zooms in. At city scale (zoom ≤ 13), only clusters with counts are shown. At street scale (zoom 14–17), individual pins appear with project-badge color. At address scale (zoom ≥ 18), pins expand to show an inline thumbnail preview. Never render a detail that is invisible or unusable at the current zoom level.

### 1.4 Legibility in All Conditions

Outdoor light, dark basements, OLED phones, wide-gamut monitors — the product must be readable everywhere. Consequences:

- Full dark mode, matching the system preference by default.
- Map tiles swap to a dark style in dark mode.
- Text never renders below 4.5:1 contrast ratio (WCAG AA).
- Minimum body type size: 14px / 0.875rem.
- **Markers are legible on any tile background.** Every map pin has a 2px white outline and a subtle drop shadow so it reads equally well against satellite imagery (bright desert, dark forest canopy, urban rooftop) as against styled vector tiles.

### 1.5 Warmth Over Sterility

_Inspired by Anthropic's design philosophy._ Cold, clinical UIs communicate distance. GeoSite is a tool people use every day on job sites — it should feel grounded and human. Warmth is embedded in the palette (off-white rather than pure white, near-black with a warm tint rather than cold blue-black), the type system (generous line-height, readable body sizes), and the language used in labels and empty states (plain, direct, never corporate).

- Light-mode backgrounds use warm off-whites (`#F9F7F4`), not cold grays.
- Dark-mode backgrounds use warm near-blacks (`#0F0E0C`), not cold blue-blacks.
- UI copy uses plain language: "Upload photos" not "Initiate image ingestion". "Something went wrong" not "Error code 5023".
- Empty states are encouraging, not passive: "Nothing here yet — start by uploading your first site photo."

### 1.6 Calm Confidence

_Inspired by Anthropic's design philosophy._ The UI should never shout. A calm interface creates trust; a frantic one creates anxiety. Consequences:

- No notification badges on the navigation sidebar unless an action genuinely requires urgent user attention.
- Primary buttons are present and clear but visually understated — their weight comes from position and label, not from an overloaded fill color.
- Error states explain what went wrong and what to do next; they do not just flash red.
- Loading states are patient: skeleton screens rather than aggressively pulsing spinners. Debounce user-triggered queries (300ms) so the UI does not reload on every keystroke.
- Transitions are short (120–250ms). The UI responds immediately but never flickers.

### 1.7 Honesty

_Inspired by Anthropic's design philosophy._ Show the user what is true. Do not hide information to make the UI look cleaner, and do not present provisional data as final. Consequences:

- If an image's location was manually corrected, indicate this at a glance (correction indicator on the marker and in the detail view). Do not silently replace the EXIF value.
- If a filter is active and hiding results, make it obvious — the active filter chip strip is always visible.
- If an upload fails, show why (file too large, no GPS data, network error) — not just a generic failure badge.
- If the system has not yet loaded all markers for the viewport, show a loading indicator. Do not present a map that appears complete but is not.

---

## 2. Reference Products

These products solve adjacent problems with notable design decisions worth studying. GeoSite should not copy them, but should learn from what they do well.

### 2.1 Mapillary (`mapillary.com`)

**What it does:** street-level photo crowdsourcing on a world map.  
**Why it is relevant:** The core interaction — a map covered in photo markers that open into a viewer — is structurally identical to GeoSite.  
**Design takeaways:**

- Splits the screen into a full-bleed map pane and a sliding image viewer. The map never disappears.
- Dense marker clusters are rendered as numbered circles; clicking a cluster zooms in. This is the model for GeoSite's cluster behavior.
- The transition between "map with markers" and "full image view" uses a right-side panel rather than a modal overlay on desktop. This keeps spatial context while viewing a photo.
- Filter controls float above the map as a compact toolbar, not as a sidebar that competes with map space.

### 2.2 iNaturalist (`inaturalist.org/observations`)

**What it does:** nature observation mapping with user-uploaded photos and taxonomy metadata.  
**Why it is relevant:** photo+metadata+map combination with filter panel and gallery view.  
**Design takeaways:**

- Shows observations as a dual view: map on the left, card grid on the right. Both update simultaneously as filters change.
- Filter panel uses clear, grouped controls (date slider, category chips, keyword search) — a good model for GeoSite's time/project/metadata filter grouping.
- Each card in the grid shows: thumbnail, time, location name, uploader name, and one primary tag — no more. GeoSite's thumbnail cards should follow the same density.
- Active filter chips appear as a persistent strip above the results. Users see what is currently applied without opening the filter panel.

### 2.3 Windy.com

**What it does:** meteorological map visualization with layered data overlays.  
**Why it is relevant:** best-in-class example of a data-rich dark-map app with minimal chrome.  
**Design takeaways:**

- The main UI is almost entirely the map. All controls collapse to a thin sidebar and a single toolbar row.
- Dark mode map tile (`--color-bg-map`) bleeds to the edge of the screen; UI panels float above it on a slightly lighter surface with a very subtle border.
- The "active layer" concept — clicking a data point opens an inline card that sticks to the map rather than navigating away — is the pattern GeoSite uses for image detail cards.
- Icon-only toolbar with tooltips on hover: appropriate for expert users (technicians using the app repeatedly). Labels on first-use onboarding is sufficient.

### 2.4 Google Maps (Mobile Web)

**What it does:** ubiquitous maps, marker taps, bottom sheets.  
**Why it is relevant:** defines user expectations for bottom-sheet map interactions on mobile.  
**Design takeaways:**

- Bottom sheet with three snap points: minimized (handle only), half-screen, full-screen. The map remains interactive in all but the full-screen state.
- Search bar is always visible at the top of the screen, even when the bottom sheet is expanded. GeoSite's search bar stays pinned to the top in mobile layout.
- Place cards animate upward from a minimized state to a full detail view — this pattern maps directly to GeoSite's image detail on mobile (tapping a marker expands the bottom sheet to half-height, revealing the thumbnail and metadata).

### 2.5 PlanRadar (`planradar.com`)

**What it does:** construction and real estate field documentation platform.  
**Why it is relevant:** direct domain competitor; solves the same "document a site with photos tied to a location" problem.  
**Design takeaways:**

- Uses a floor-plan / site-plan overlay rather than a map, but the marker-pin interaction model is identical. This validates the core UX pattern.
- Prominent "Add issue" / "New report" floating action button in the bottom-right corner on mobile — a pattern GeoSite should consider for the upload trigger.
- Photo cards in the list view display: thumbnail (left), short description, tag badge (right), and a timestamp — compact but information-rich. Mirror this in GeoSite's thumbnail grid.
- Status badges on markers use color encoding: useful precedent for GeoSite's corrected-vs-EXIF markers (e.g., a small indicator dot on a marker showing whether it has been manually corrected).

### 2.6 Procore (`procore.com`) – Photos Module

**What it does:** enterprise construction management; photos module manages site photos by project and location.  
**Why it is relevant:** mature approach to construction photo organization at scale.  
**Design takeaways:**

- Album-style group view with project/location breadcrumbs — validates GeoSite's named-group model.
- "Filter by location, date, trade" sidebar with applied filter chips is a near-exact match for GeoSite's filter panel requirements.
- Bulk-select mode: tapping a checkbox enters multi-select; a floating action bar appears at the bottom. GeoSite's batch metadata assignment and group-add actions should adopt this pattern.
- Full-screen image viewer includes: next/prev arrows, metadata panel on the right (collapsible), download button (post-MVP for GeoSite), and a map thumbnail in the corner showing the photo's location.

### 2.7 Linear (`linear.app`)

**What it does:** project management SaaS with highly regarded UI design.  
**Why it is relevant:** best living example of dark-mode-first, clean typography and the "sidebar + content + detail" three-panel layout GeoSite uses on desktop.  
**Design takeaways:**

- Dark surface hierarchy: `--color-bg-base` (deepest), `--color-bg-surface` (+slightly lighter), `--color-bg-elevated` (cards, dropdowns). GeoSite's token system should mirror this three-level surface model.
- Keyboard shortcuts encouraged throughout; shortcuts are shown inline in tooltips and menus.
- Monospace font used sparingly for code/IDs; clean sans-serif for all other content.
- Empty states are illustrative and unambiguous — "No images in this area. Try expanding the radius or adjusting filters." with a clear secondary action button.

### 2.8 Claude / Anthropic (`claude.ai`)

**What it does:** AI assistant with a highly considered, restrained interface.  
**Why it is relevant:** Claude's UI design philosophy — warmth, restraint, honesty, calm confidence — is the direct source of GeoSite's principles 1.5–1.7. It is worth studying in depth because it represents a rare case of a professional product that feels genuinely human without sacrificing clarity.  
**Design takeaways:**

- **Warm neutral palette.** Claude.ai uses warm off-whites (the `#FAF9F7` family) for light mode and a warm near-black (the `#0F0E0C` family) for dark mode. Neither reaches pure white or pure black. This prevents eye strain and gives the interface a craft quality that cold grays cannot. GeoSite adopts this directly in its `--color-bg-base` tokens.
- **Three-level warm surface hierarchy in dark mode.** Base (`#0F0E0C`) → Panel/sidebar (`#1A1917`) → Elevated/card (`#252320`). Each step is a ~7% luminance shift rather than a large jump. The result is clear depth without harsh contrast between layers.
- **Typography carries the weight.** Claude's UI uses very little ornamentation. Hierarchy is achieved almost entirely through font size, weight, and the distinction between `--color-text-primary` and `--color-text-secondary`. This is the model for GeoSite's workspace pane and filter panel.
- **Primary actions are placed, not decorated.** The send button in Claude is visually present but not aggressive — it sits at the right of the input area, not as a glowing full-width CTA. GeoSite's primary action buttons ("Save correction", "Confirm upload") follow the same logic: correct placement and label, not visual over-emphasis.
- **Brand accent used sparingly.** Anthropic's warm orange-terracotta hue appears only at moments where the brand actively needs to assert itself — a loading bar, an active state, a key callout. It is never used decoratively. GeoSite adopts this reserve: `--color-clay` (upload CTAs, active selection) is the only warm-accent color and is never used for decoration.
- **Calm loading states.** Claude uses a gentle pulsing sequence, not an aggressive spinner. Time-to-first-content is prioritized; placeholders look structurally complete. GeoSite's three-tier progressive image loading (markers → thumbnails → full-res) follows the same instinct.
- **Plain-language UI copy.** Claude's interface labels are direct: "New chat", "Projects", "History". Not "Initiate session", "Workspaces", "Interaction log". Every GeoSite label should be audited against this standard before shipping.

### 2.9 Eleken – Map UI Design Research (`eleken.co/blog-posts/map-ui-design`)

**What it is:** a practitioner case study from a UX/product agency that has built several production geospatial products (ReVeal, Greenventory, Gamaya, Involi, Astraea — platforms where the map is the product).  
**Why it is relevant:** the most directly applicable published guide to the specific class of UI problem GeoSite solves. Every principle in this section was learned from a shipped product, not from theory.  
**Key lessons extracted for GeoSite:**

- **Never ship a default map.** "Default maps often look unattractive. If you're building a product around maps, you always need to style them. Adjust colors, simplify details, reduce clutter — whatever it takes to make the map feel like it belongs in your product." (Maksym, Eleken Head of Design). Consequence: GeoSite must launch with a brand-adapted tile style, not stock OSM.
- **Visual hierarchy has four layers.** (1) Base map — geography foundation. (2) Data layer — GeoSite's photo markers, the product's unique value. (3) Interactive elements — radius circle, selection handles, hover states. (4) UI chrome — toolbar, filter panel, workspace pane. Each layer must be visually subordinate to the layer above it in this list. The data layer is always the most prominent thing on the map.
- **Two interaction modes must coexist without conflict.** Map navigation (zoom, pan, explore) vs. object interaction (tap marker, draw selection, view detail). The Eleken team describes this as their hardest recurring challenge. GeoSite addresses it by: (a) using long-press as the entry point for radius selection, preventing accidental activation; (b) showing a cursor change on desktop when entering selection mode; (c) de-selecting on intentional map pan, but not on pinch-zoom (which is non-intentional).
- **Cluster objects when density exceeds readability.** The ReVeal project shows that city-scale maps with hundreds of markers become unusable without clustering. Solution: group by neighborhood when zoomed out, expand to individual markers on zoom-in. This is the exact pattern GeoSite implements via `ST_SnapToGrid` server-side clustering.
- **"Info on demand," not "info always on."** Click any object for its detail; do not clutter the base map view. GeoSite's marker carries only a color-coded pin + optional project badge — all other metadata surfaces in the detail panel on tap.
- **Context retention when navigating.** A selected marker stays highlighted and the workspace pane stays populated when the user pans or zooms. A "Return to selected" link in the search bar area restores context if the user has panned far away.
- **Keep things simple at first glance, but make advanced features easily accessible.** The most successful map interfaces Eleken has built share this trait. GeoSite achieves this via the collapsed filter panel, the fixed Active Selection tab, and the hidden batch-action context menu.

---

## 3. Visual Language

### 3.1 Color Tokens

Design tokens are CSS custom properties. All components use tokens — never raw hex or Tailwind arbitrary values in design-sensitive contexts.

#### Semantic token hierarchy

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
| `--color-primary`        | `#2563EB`   | `#3B82F6`  | Primary actions, active markers, focus rings                                           |
| `--color-primary-hover`  | `#1D4ED8`   | `#60A5FA`  | Hover state for primary                                                                |
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

For MVP: use CartoDB Light (Positron) in light mode — already significantly cleaner than stock OSM. Apply full custom brand tile style post-MVP (see Section 10).

#### Dark mode tile layers

- **Light mode:** CartoDB Positron (clean, minimal, light) — `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- **Dark mode:** CartoDB Dark Matter — `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Dark mode alternative:** Stadia Alidade Smooth Dark — `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png`

The tile URL is set by `MapAdapter.setTileStyle('light' | 'dark')` and changes when `ThemeService` emits a theme change event.

### 3.2 Typography

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

### 3.3 Spacing and Grid

GeoSite uses a **4px base unit** with a Tailwind-standard scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px).

Key layout dimensions:

| Element                          | Value               |
| -------------------------------- | ------------------- |
| Sidebar width (collapsed)        | 48px                |
| Sidebar width (expanded)         | 240px               |
| Workspace pane width (default)   | 360px               |
| Workspace pane width (min)       | 280px               |
| Workspace pane width (max)       | 640px               |
| Top toolbar height               | 56px                |
| Bottom sheet (min / half / full) | 64px / 50vh / 100vh |
| Map padding (viewport pre-fetch) | 10% on each edge    |
| Filter panel width (desktop)     | 280px               |
| Thumbnail size (grid)            | 128×128px           |
| Thumbnail size (list)            | 64×64px             |
| Tap target minimum (mobile)      | 48×48px             |
| Tap target minimum (desktop)     | 44×44px             |

### 3.4 Border Radius

The UI uses a consistent "friendly but professional" radius system:

| Element                       | Radius                   |
| ----------------------------- | ------------------------ |
| Cards, panels, workspace pane | `rounded-xl` (12px)      |
| Buttons, inputs, dropdowns    | `rounded-lg` (8px)       |
| Chips, badges, tags           | `rounded-full`           |
| Thumbnails in grid            | `rounded-md` (6px)       |
| Map overlays / floating cards | `rounded-xl` with shadow |
| Modals                        | `rounded-2xl` (16px)     |

### 3.5 Shadows and Elevation

Three elevation levels, used consistently:

| Level  | Token       | Usage                                   |
| ------ | ----------- | --------------------------------------- |
| Low    | `shadow-sm` | Toolbar separators, subtle panel lift   |
| Medium | `shadow-md` | Floating panels, filter drawer          |
| High   | `shadow-xl` | Modals, image detail overlay, dropdowns |

In dark mode, shadows are less visible — increase surface contrast (`--color-bg-elevated` vs `--color-bg-surface`) to compensate.

### 3.6 Iconography

Use a single coherent icon set throughout. Default: **Lucide Icons** (MIT licensed, clean, consistent stroke width). The stroke-based style of Lucide aligns with the warm, restrained aesthetic — it reads well at small sizes without appearing heavy or aggressive.

Icon sizing conventions:

- Toolbar / navigation: 20px
- Inline with text: 16px
- Large actions (FAB, empty states): 32–40px
- Map markers: custom SVG (not icon font)

All interactive icons must have a visible label or a `title` / `aria-label` attribute for accessibility.

### 3.7 Map Visual Hierarchy and Zoom Levels

A well-designed map has four distinct visual layers, each lower in visual weight than the layer above it. This hierarchy must be enforced via tile styling, z-index management, and zoom-level logic:

| Layer                | Visual weight | Elements                                       | Design rule                                                                               |
| -------------------- | ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Base map             | Lowest        | Roads, buildings, water, terrain               | Muted — no POI clutter, desaturated fills, thin outlines                                  |
| Data layer           | **Highest**   | Photo markers, clusters                        | Most visually prominent element on the map. `--color-primary` fill, white outline, shadow |
| Interactive elements | Medium-high   | Radius circle, selection handles, hover states | Clearly distinct from base, does not compete with markers                                 |
| UI chrome            | Medium        | Toolbar, filter panel, workspace pane          | Floats above map on `--color-bg-surface` background with shadow                           |

Quoting Eleken's Head of Design: _"The challenge is balancing information density with readability. You need to decide what information is essential at each zoom level and how to present it without overwhelming the user."_

**Zoom-level visibility rules:**

| Zoom level                | What is shown                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| ≤ 12 (city / region)      | Clusters only — numbered circle, `--color-bg-elevated` fill, count in `--text-caption`          |
| 13–15 (district / street) | Individual pins — drop-shaped, `--color-primary` fill, white outline, no text                   |
| 16–17 (block)             | Pin + project badge chip beneath the pin (short project name, `--color-accent` background)      |
| ≥ 18 (address)            | Pin + project badge + inline thumbnail preview (64×64, `rounded-md`) for the nearest 1–3 images |

From the Eleken ReVeal case: objects are grouped by neighborhood to improve performance when viewing larger areas. At zoom ≤ 12, rendering individual pins for thousands of images would be both visually unreadable and technically prohibitive. The zoom-level transition from cluster → pin → pin+badge → pin+thumbnail is the solution.

---

## 4. Layout System

### 4.1 Desktop Layout (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Sidebar (48px collapsed / 240px expanded)  │  Top Toolbar (56px)       │
├─────────────────────────────────────────────────────────────────────────┤
│                                              │                           │
│                                              │  Workspace Pane (360px)   │
│           Map Pane (fills remaining space)   │  [Group Tabs]             │
│                                              │  [Thumbnail Gallery]      │
│                                              │  [Detail View - inline]   │
│                                              │                           │
└─────────────────────────────────────────────────────────────────────────┘
```

- The sidebar houses navigation links: Map, Groups, Upload (shortcut), Settings.
- The top toolbar contains: address search bar (dominant), filter toggle, theme toggle, user avatar.
- The filter panel slides in over the map from the top-right (below the toolbar), pushing the workspace pane down by its height. It does not push the map.
- The workspace pane is resizable (drag handle on the left edge), collapsible (chevron toggle).

### 4.2 Tablet Layout (768–1023px)

- Sidebar collapses to icon-only (48px). Long-press or swipe-right reveals a temporary overlay sidebar.
- Workspace pane becomes a slide-over drawer (right edge), triggered by a FAB or tab at the right edge of the screen.
- Filter panel opens as a full-width sheet from the top.
- Map occupies full width when workspace is dismissed.

### 4.3 Mobile Layout (< 768px)

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
- The Upload FAB is a 56px circle, fixed to the bottom-right, above the bottom sheet handle.

---

## 5. Component Patterns

### 5.1 Map Marker

A custom SVG pin, not a default Leaflet marker. Anatomy:

- **Pin body:** drop-shaped, filled with the semantic marker color (`--color-primary` by default).
- **Inner icon:** a small photo icon (16×16) centered in the pin body. Acts as a visual affordance that this is a photo, not a generic map pin.
- **Correction indicator:** a small dot in `--color-accent` at the top-right corner, visible only for corrected markers.
- **Pending indicator:** a pulsing ring in `--color-warning` for images in the upload queue.

Marker tap/click area is extended to 48×48px via a transparent hit zone, regardless of the visual pin size (32×40px). On desktop, a hover state elevates the marker (scale 1.15, `transition: transform 120ms ease-out`).

**Cluster:**

- A circle of radius 20–36px (scales logarithmically with cluster size).
- Background: `--color-bg-elevated`, border: `--color-border-strong`, 2px.
- Count badge: `--text-caption`, `--color-text-primary`.
- Cluster hover: scale 1.1, cursor pointer.

### 5.2 Filter Panel

The filter panel is a grouped accordion. Each group has a header with a collapse chevron and a live "active count" badge that shows how many values are currently selected.

Groups (in order):

1. **Time range** — dual date picker (from / to). "Last 7 days", "Last 30 days", "Last year" quick presets.
2. **Project** — multi-select checkboxes with search input. Max 5 visible; scroll for more.
3. **Metadata** — key/value pair builder. Select a key from a dropdown (autocompletes from org keys), enter a value (autocompletes from existing values for that key).
4. **Max distance** — radio buttons: 25m / 50m / 100m / 250m / Custom. Custom shows a number input in meters.
5. **Applied filters summary** — a compact chip row at the top of the filter panel showing all active constraints. Each chip has a ✕ to remove it inline. This row also appears as a strip above the map search bar (always visible, even when the filter panel is closed).

Filter panel animation: slides in from the top-right (desktop) or bottom (mobile) using `transform: translateY(-100%)` → `translateY(0)` with `transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1)`.

### 5.3 Workspace Pane — Group Tabs

The workspace pane header is a scrollable tab row. Tab types:

- **Active Selection** (pinned left, ephemeral): shows images from the current radius selection or marker interaction. Icon: crosshair. Cannot be renamed or closed.
- **Named group tabs** (scrollable): user-created groups. Each tab shows a group name. Long-press → rename/delete context menu.

Tab overflow: if more than 5 named groups exist, tabs become horizontally scrollable. A "+" button at the right end of the tab row creates a new group.

Within each tab, the gallery is a responsive masonry or fixed-grid of thumbnail cards:

**Thumbnail card:**

- 128×128px thumbnail (object-cover).
- Bottom-left: capture date in `--text-caption` on a semi-transparent dark scrim.
- Bottom-right: project badge (short name, colored chip in `--color-accent` or project-assigned color).
- Top-right: metadata preview (single key=value shorthand, e.g., "Beton").
- Selection checkbox (top-left): appears on hover (desktop) / always visible in bulk-select mode (mobile).
- Correction dot: top-right corner, matches marker correction indicator.

Sorting controls (above the gallery): "Date ↓", "Date ↑", "Distance from map center", "Name". Compact segmented control.

### 5.4 Image Detail View

Desktop: inline in the workspace pane (replaces the gallery, back arrow to return).
Mobile: full-screen overlay (back button top-left).

Layout:

```
┌─────────────────────────────────────────────┐
│ ← Back                              [Actions ⋯] │
├─────────────────────────────────────────────┤
│                                             │
│        Full-resolution image                │
│        (loads progressively from thumb)     │
│                                             │
├─────────────────────────────────────────────┤
│ Timestamp: 14 Aug 2025, 09:47               │
│ Uploader: M. Kleve                          │
│ Project: Renovation Zürich-Nord             │
│ ─────────────────────────────────           │
│ 📍 Coordinates (corrected)    [Edit Location] │
│    47.3769° N, 8.5417° E                    │
│    ↳ EXIF: 47.3770° N, 8.5419° E (12m off) │
│    [Reset to EXIF]                          │
│ ─────────────────────────────────           │
│ Metadata                       [Edit]       │
│  Material: Beton                            │
│  Work stage: Pre-treatment                  │
│ ─────────────────────────────────           │
│ ◀  Previous image    Next image  ▶          │
└─────────────────────────────────────────────┘
```

Actions menu (`⋯`): "Delete image", "Add to group", "Copy coordinates", "Download" (post-MVP).

### 5.5 Upload Flow

Upload entry: a FAB on mobile (56px circle, upload icon), a button in the top toolbar on desktop, or via drag-and-drop onto the map pane.

Upload sheet / modal:

```
Step 1: SELECT FILES
  ┌──────────────────────────────────────┐
  │   Drag & drop photos here            │
  │   or [Browse files]                  │
  │   JPEG, PNG, WebP, HEIC · max 25 MB  │
  └──────────────────────────────────────┘
  Selected: 14 files (3 exceed 4096px and will be resized)

Step 2: REVIEW LOCATIONS
  [Map with pending markers]
  2 images missing GPS location — place manually or skip
  [Assign project to all: dropdown]
  [Add metadata to all: key / value]

Step 3: UPLOAD PROGRESS
  ████████████████░░░░░░░░ 8 / 14 uploading
  file_001.jpg ✓
  file_002.jpg ✓
  file_003.jpg ▲ Uploading 62%
  file_004.jpg ✗ Failed [Retry]
```

Each step is a distinct scrollable screen within the upload sheet. Progress persists if the user dismisses the sheet (collapses to a mini-progress bar in the toolbar).

### 5.6 Radius Selection Circle

When the technician long-presses (mobile) or right-click-drags (desktop) the map:

- A blue semi-transparent circle expands from the press point.
- The circle border is `--color-primary` at 60% opacity, 2px dashed stroke.
- The fill is `--color-primary` at 10% opacity.
- A live radius label floats above the circle: `"143 m"`, styled as a small chip with `--color-bg-elevated` background and `--color-text-primary` text.
- Drag handles appear on the circle's cardinal points (N/S/E/W) for resizing after release.
- A ✕ dismiss button appears in the top-right of the map overlay area.

### 5.7 Empty States

Each empty state includes:

- A centered illustration (line-art, matches the current light/dark theme).
- A primary message in `--text-display`.
- A secondary explanation in `--text-body`, `--color-text-secondary`.
- An actionable suggestion button.

**Examples:**

| Context                  | Message                                                                    | Action              |
| ------------------------ | -------------------------------------------------------------------------- | ------------------- |
| No images in viewport    | "Nothing here yet" + "Try expanding the radius or adjusting your filters." | "Clear filters"     |
| Empty group tab          | "This group is empty" + "Add images by selecting them on the map."         | "Go to map"         |
| No search results        | "No address found" + "Try a different address or pin a location manually." | "Drop pin manually" |
| First login (no uploads) | "Welcome to GeoSite" + "Start by uploading your first site photos."        | "Upload photos"     |

---

## 6. Motion and Transitions

All motion serves clarity or orientation — no decorative animation.

| Interaction                  | Effect                                           | Duration | Easing                                   |
| ---------------------------- | ------------------------------------------------ | -------- | ---------------------------------------- |
| Panel slide in/out (desktop) | `transform: translateX`                          | 200ms    | `ease-out`                               |
| Bottom sheet snap (mobile)   | `transform: translateY`                          | 250ms    | `cubic-bezier(0.4, 0, 0.2, 1)`           |
| Marker appear (map load)     | `opacity: 0→1`, slight upward translate          | 150ms    | `ease-out` (staggered by 30ms per batch) |
| Marker tap (highlight)       | `scale: 1→1.2→1.1`                               | 200ms    | spring-like `ease-in-out`                |
| Thumbnail load               | `opacity: 0→1` from placeholder blur             | 300ms    | `ease-out`                               |
| Filter chip add/remove       | `opacity + max-width` (chip appear/collapse)     | 180ms    | `ease-in-out`                            |
| Page navigation              | No full-page transitions; panels update in place | —        | —                                        |

`prefers-reduced-motion: reduce` disables all transforms and fades, keeping only immediate state changes.

---

## 7. Dark Mode

Dark mode is first-class, not an afterthought. Every component ships with dark-mode Tailwind variants.

Dark mode is inspired directly by Anthropic's approach to Claude: **warm, not cold**. Most dark UIs skew blue-black (cold, techy). GeoSite's dark mode skews toward a warm near-black — the same instinct that makes a physical notebook feel more comfortable than a screen.

**Design rules for dark mode:**

1. **Backgrounds are warm near-black, never cold blue-black and never pure black.** `--color-bg-base: #0F0E0C`. The slight warm tint (+2 red, -2 blue relative to neutral) is not consciously perceptible but produces a measurably more comfortable reading environment for extended field use.
2. **Three-level warm surface hierarchy.** `#0F0E0C → #1A1917 → #252320`. Each step is a ~7-8% luminance lift. The warm tint is preserved at each level. This mirrors Anthropic's surface system and avoids the harsh contrast that cold-gray dark themes create between surface layers.
3. **Primary color brightens slightly.** `--color-primary: #2563EB` (light) → `#3B82F6` (dark). On a dark surface, the lighter blue maintains equivalent perceived contrast without oversaturating.
4. **Clay accent stays warm in dark mode.** `--color-clay: #D9895A` (dark) — slightly lighter and more saturated than the light-mode value to compensate for the dark background. This is the only warm-hued element in the dark UI; its rarity makes upload CTAs unmistakeable.
5. **Borders are warm and subtle.** `--color-border: #2E2B27` — a warm dark brown, barely visible but enough to delineate panels without harsh lines.
6. **Map tile: CartoDB Dark Matter.** The dark tile URL is configured in `LeafletOSMAdapter.darkTileUrl`. The tile's dark neutral palette blends naturally with `--color-bg-base`. Markers with white outlines and shadows read clearly against it.
7. **Image thumbnails need no special treatment.** Photos are self-contained; they do not invert or adapt.
8. **User preference persisted to `localStorage` as `geosite-theme: 'dark' | 'light' | 'system'`.** Default: `'system'` (follows OS preference).
9. **Theme toggle** in the top toolbar: a sun/moon icon button. Single tap cycles between `light → dark → system`. The icon itself uses `--color-clay` as a fill accent to make it visually warm and memorable.

---

## 8. Accessibility

- **Keyboard navigation:** all interactive elements are reachable by Tab. Map markers are reachable via arrow keys when the map has focus (Leaflet keyboard plugin or custom implementation).
- **Focus ring:** `outline: 2px solid var(--color-primary)` with `outline-offset: 2px`. Never `outline: none` without a visible alternative.
- **ARIA roles:** map landmarks (`role="main"`, `role="complementary"` for workspace pane), live regions for upload progress (`aria-live="polite"`), and loading states (`aria-busy`).
- **Alt text:** all images have descriptive alt text generated from metadata: `"Photo taken 14 Aug 2025 at 47.38°N 8.54°E, project Zürich-Nord, material Beton."`.
- **Color is never the sole differentiator.** Markers use both color and an icon; status badges use color, icon, and text label.
- **Minimum contrast:** 4.5:1 for normal text, 3:1 for large text (≥18px bold or ≥24px regular). Validated via `@tailwindcss/a11y` and CI contrast checks.

---

## 9. Responsive Behavior Quick Reference

| Breakpoint          | Map                        | Workspace                     | Filters            | Sidebar                    | Upload             |
| ------------------- | -------------------------- | ----------------------------- | ------------------ | -------------------------- | ------------------ |
| Mobile `< 768px`    | Full bleed                 | Bottom sheet (3 snaps)        | Bottom modal       | Hamburger                  | FAB (bottom-right) |
| Tablet `768–1023px` | Full width                 | Slide-over drawer             | Sheet              | Icon-only sidebar          | Toolbar button     |
| Desktop `≥ 1024px`  | Left pane, fills remaining | Right pane (360px, resizable) | Drops from toolbar | Left sidebar (collapsible) | Toolbar button     |

---

## 10. Design Debt and Future Considerations

These are intentional deferrals, not oversights.

1. **Custom typeface:** the system-font stack is chosen for performance on low-end field devices. A brand typeface (e.g., Inter as a web font) is a post-MVP refinement. If Inter is adopted, preload the variable font subset (latin, weights 400+600 only) to avoid FOUT on field devices.
2. **Illustration library:** empty-state illustrations are specified but not yet designed. They should be warm, line-art SVGs that use `currentColor` so they adapt to both light and dark mode without duplication. Style reference: Anthropic's own illustrated brand assets — warm, approachable, hand-drawn-feeling without being cartoonish.
3. **Tile styling:** the plan to strip default OSM tiles (see Section 3.7) requires a Mapbox Studio account or Stadia custom style. For MVP, use CartoDB Light (Positron) in light mode — it is already significantly cleaner than stock OSM. Apply full brand tile styling post-MVP.
4. **Animation library:** motion guidelines are defined but implementation uses vanilla CSS transitions. A dedicated animation system (Angular Animations) is post-MVP.
5. **Onboarding / first-use tour:** defined only at the empty-state level. A guided walkthrough for new users is post-MVP.
6. **Heatmap / density overlay:** post-MVP. Map layer capability (tile swapping via `MapAdapter`) is already designed to support it.
7. **Before/after slider component:** post-MVP feature but the full-image viewer layout anticipates it.
8. **Brand color finalization:** `--color-primary: #2563EB` (blue) is a working default. The warm palette overall (Principle 1.5, Section 7) is confirmed as the design direction. The clay accent (`--color-clay: #CC7A4A`) is confirmed. Primary blue is the only open question before MVP launch.
9. **Marker thumbnail overlay at high zoom:** the zoom-level visibility rule (Section 3.7) specifies a 64×64 thumbnail inline at zoom ≥ 18. This requires a hover/tap interaction model decision for desktop (does the thumbnail appear on hover, or always?). Defer to post-MVP; ship zoom ≥ 18 as pin + project badge only.
