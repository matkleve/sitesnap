# Sitesnap – Reference Products

Human reading only. Do not load in agentic coding sessions.

## 2. Reference Products

These products solve adjacent problems with notable design decisions worth studying. Sitesnap should not copy them, but should learn from what they do well.

### 2.1 Mapillary (`mapillary.com`)

**What it does:** street-level photo crowdsourcing on a world map.  
**Why it is relevant:** The core interaction — a map covered in photo markers that open into a viewer — is structurally identical to Sitesnap.  
**Design takeaways:**

- Splits the screen into a full-bleed map pane and a sliding image viewer. The map never disappears.
- Dense marker clusters are rendered as numbered circles; clicking a cluster zooms in. This is the model for Sitesnap's cluster behavior.
- The transition between "map with markers" and "full image view" uses a right-side panel rather than a modal overlay on desktop. This keeps spatial context while viewing a photo.
- Filter controls float above the map as a compact toolbar, not as a sidebar that competes with map space.

### 2.2 iNaturalist (`inaturalist.org/observations`)

**What it does:** nature observation mapping with user-uploaded photos and taxonomy metadata.  
**Why it is relevant:** photo+metadata+map combination with filter panel and gallery view.  
**Design takeaways:**

- Shows observations as a dual view: map on the left, card grid on the right. Both update simultaneously as filters change.
- Filter panel uses clear, grouped controls (date slider, category chips, keyword search) — a good model for Sitesnap's time/project/metadata filter grouping.
- Each card in the grid shows: thumbnail, time, location name, uploader name, and one primary tag — no more. Sitesnap's thumbnail cards should follow the same density.
- Active filter chips appear as a persistent strip above the results. Users see what is currently applied without opening the filter panel.

### 2.3 Windy.com

**What it does:** meteorological map visualization with layered data overlays.  
**Why it is relevant:** best-in-class example of a data-rich dark-map app with minimal chrome.  
**Design takeaways:**

- The main UI is almost entirely the map. All controls collapse to a thin sidebar and a single toolbar row.
- Dark mode map tile (`--color-bg-map`) bleeds to the edge of the screen; UI panels float above it on a slightly lighter surface with a very subtle border.
- The "active layer" concept — clicking a data point opens an inline card that sticks to the map rather than navigating away — is the pattern Sitesnap uses for image detail cards.
- Icon-only toolbar with tooltips on hover: appropriate for expert users (technicians using the app repeatedly). Labels on first-use onboarding is sufficient.

### 2.4 Google Maps (Mobile Web)

**What it does:** ubiquitous maps, marker taps, bottom sheets.  
**Why it is relevant:** defines user expectations for bottom-sheet map interactions on mobile.  
**Design takeaways:**

- Bottom sheet with three snap points: minimized (handle only), half-screen, full-screen. The map remains interactive in all but the full-screen state.
- Search bar is always visible at the top of the screen, even when the bottom sheet is expanded. Sitesnap's search bar stays pinned to the top in mobile layout.
- Place cards animate upward from a minimized state to a full detail view — this pattern maps directly to Sitesnap's image detail on mobile (tapping a marker expands the bottom sheet to half-height, revealing the thumbnail and metadata).

### 2.5 PlanRadar (`planradar.com`)

**What it does:** construction and real estate field documentation platform.  
**Why it is relevant:** direct domain competitor; solves the same "document a site with photos tied to a location" problem.  
**Design takeaways:**

- Uses a floor-plan / site-plan overlay rather than a map, but the marker-pin interaction model is identical. This validates the core UX pattern.
- Prominent "Add issue" / "New report" floating action button in the bottom-right corner on mobile — a pattern Sitesnap should consider for the upload trigger.
- Photo cards in the list view display: thumbnail (left), short description, tag badge (right), and a timestamp — compact but information-rich. Mirror this in Sitesnap's thumbnail grid.
- Status badges on markers use color encoding: useful precedent for Sitesnap's corrected-vs-EXIF markers (e.g., a small indicator dot on a marker showing whether it has been manually corrected).

### 2.6 Procore (`procore.com`) – Photos Module

**What it does:** enterprise construction management; photos module manages site photos by project and location.  
**Why it is relevant:** mature approach to construction photo organization at scale.  
**Design takeaways:**

- Album-style group view with project/location breadcrumbs — validates Sitesnap's named-group model.
- "Filter by location, date, trade" sidebar with applied filter chips is a near-exact match for Sitesnap's filter panel requirements.
- Bulk-select mode: tapping a checkbox enters multi-select; a floating action bar appears at the bottom. Sitesnap's batch metadata assignment and group-add actions should adopt this pattern.
- Full-screen image viewer includes: next/prev arrows, metadata panel on the right (collapsible), download button (post-MVP for Sitesnap), and a map thumbnail in the corner showing the photo's location.

### 2.7 Linear (`linear.app`)

**What it does:** project management SaaS with highly regarded UI design.  
**Why it is relevant:** best living example of dark-mode-first, clean typography and the "sidebar + content + detail" three-panel layout Sitesnap uses on desktop.  
**Design takeaways:**

- Dark surface hierarchy: `--color-bg-base` (deepest), `--color-bg-surface` (+slightly lighter), `--color-bg-elevated` (cards, dropdowns). Sitesnap's token system should mirror this three-level surface model.
- Keyboard shortcuts encouraged throughout; shortcuts are shown inline in tooltips and menus.
- Monospace font used sparingly for code/IDs; clean sans-serif for all other content.
- Empty states are illustrative and unambiguous — "No images in this area. Try expanding the radius or adjusting filters." with a clear secondary action button.

### 2.8 Claude / Anthropic (`claude.ai`)

**What it does:** AI assistant with a highly considered, restrained interface.  
**Why it is relevant:** Claude's UI design philosophy — warmth, restraint, honesty, calm confidence — is the direct source of Sitesnap's principles 1.5–1.7. It is worth studying in depth because it represents a rare case of a professional product that feels genuinely human without sacrificing clarity.  
**Design takeaways:**

- **Warm neutral palette.** Claude.ai uses warm off-whites (the `#FAF9F7` family) for light mode and a warm near-black (the `#0F0E0C` family) for dark mode. Neither reaches pure white or pure black. This prevents eye strain and gives the interface a craft quality that cold grays cannot. Sitesnap adopts this directly in its `--color-bg-base` tokens.
- **Three-level warm surface hierarchy in dark mode.** Base (`#0F0E0C`) → Panel/sidebar (`#1A1917`) → Elevated/card (`#252320`). Each step is a ~7% luminance shift rather than a large jump. The result is clear depth without harsh contrast between layers.
- **Typography carries the weight.** Claude's UI uses very little ornamentation. Hierarchy is achieved almost entirely through font size, weight, and the distinction between `--color-text-primary` and `--color-text-secondary`. This is the model for Sitesnap's workspace pane and filter panel.
- **Primary actions are placed, not decorated.** The send button in Claude is visually present but not aggressive — it sits at the right of the input area, not as a glowing full-width CTA. Sitesnap's primary action buttons ("Save correction", "Confirm upload") follow the same logic: correct placement and label, not visual over-emphasis.
- **Brand accent used sparingly.** Anthropic's warm orange-terracotta hue appears only at moments where the brand actively needs to assert itself — a loading bar, an active state, a key callout. It is never used decoratively. Sitesnap adopts this reserve: `--color-clay` (upload CTAs, active selection) is the only warm-accent color and is never used for decoration.
- **Calm loading states.** Claude uses a gentle pulsing sequence, not an aggressive spinner. Time-to-first-content is prioritized; placeholders look structurally complete. Sitesnap's three-tier progressive image loading (markers → thumbnails → full-res) follows the same instinct.
- **Plain-language UI copy.** Claude's interface labels are direct: "New chat", "Projects", "History". Not "Initiate session", "Workspaces", "Interaction log". Every Sitesnap label should be audited against this standard before shipping.

### 2.9 Eleken – Map UI Design Research (`eleken.co/blog-posts/map-ui-design`)

**What it is:** a practitioner case study from a UX/product agency that has built several production geospatial products (ReVeal, Greenventory, Gamaya, Involi, Astraea — platforms where the map is the product).  
**Why it is relevant:** the most directly applicable published guide to the specific class of UI problem Sitesnap solves. Every principle in this section was learned from a shipped product, not from theory.  
**Key lessons extracted for Sitesnap:**

- **Never ship a default map.** "Default maps often look unattractive. If you're building a product around maps, you always need to style them. Adjust colors, simplify details, reduce clutter — whatever it takes to make the map feel like it belongs in your product." (Maksym, Eleken Head of Design). Consequence: Sitesnap must launch with a brand-adapted tile style, not stock OSM.
- **Visual hierarchy has four layers.** (1) Base map — geography foundation. (2) Data layer — Sitesnap's photo markers, the product's unique value. (3) Interactive elements — radius circle, selection handles, hover states. (4) UI chrome — toolbar, filter panel, workspace pane. Each layer must be visually subordinate to the layer above it in this list. The data layer is always the most prominent thing on the map.
- **Two interaction modes must coexist without conflict.** Map navigation (zoom, pan, explore) vs. object interaction (tap marker, draw selection, view detail). The Eleken team describes this as their hardest recurring challenge. Sitesnap addresses it by: (a) using long-press as the entry point for radius selection, preventing accidental activation; (b) showing a cursor change on desktop when entering selection mode; (c) de-selecting on intentional map pan, but not on pinch-zoom (which is non-intentional).
- **Cluster objects when density exceeds readability.** The ReVeal project shows that city-scale maps with hundreds of markers become unusable without clustering. Solution: group by neighborhood when zoomed out, expand to individual markers on zoom-in. This is the exact pattern Sitesnap implements via `ST_SnapToGrid` server-side clustering.
- **"Info on demand," not "info always on."** Click any object for its detail; do not clutter the base map view. Sitesnap's marker carries only a color-coded pin + optional project badge — all other metadata surfaces in the detail panel on tap.
- **Context retention when navigating.** A selected marker stays highlighted and the workspace pane stays populated when the user pans or zooms. A "Return to selected" link in the search bar area restores context if the user has panned far away.
- **Keep things simple at first glance, but make advanced features easily accessible.** The most successful map interfaces Eleken has built share this trait. Sitesnap achieves this via the collapsed filter panel, the fixed Active Selection tab, and the hidden batch-action context menu.

### 2.10 Notion (`notion.so`)

**What it does:** workspace and knowledge management tool with a block-based page editor, database views, and a command palette.  
**Why it is relevant:** Notion is the most refined production example of "quiet chrome" — an interface where controls hide until needed, letting content stay foreground at all times. Its micro-interaction patterns for hover-to-reveal actions, ghost buttons, compact toolbars, property-style editing, and command palettes are directly applicable to Sitesnap's workspace pane, thumbnail grid, and image detail view.  
**Design takeaways:**

- **Hover-to-reveal inline actions.** In Notion, row-level controls (drag handle, checkbox, `⋯` menu) are `opacity: 0` at rest and animate to `opacity: 1` in ~80ms when the cursor enters the row. There is no layout shift — space for the controls is always reserved. This prevents visual noise in dense lists while keeping actions one hover away. Sitesnap applies this to thumbnail cards, group tab rows, and metadata property rows: the checkbox, group-add icon, and context-menu button exist in the DOM but are invisible at rest, revealed on hover.
- **Ghost buttons as the default.** Notion's toolbar buttons, sidebar actions, and secondary controls are all ghost-style: transparent background, no border, just an icon or label. A background fill appears on hover (`--color-bg-elevated` at ~40% opacity, 80ms fade). This reserves visual weight for the one or two actions per screen that genuinely need a filled button. Sitesnap inherits this: every action button that is not a primary CTA (confirm upload, save correction) renders as a ghost button.
- **28–32px compact element heights.** Notion's standard interactive height is 28px for inline controls (property chips, icon buttons in toolbars, command palette results) and 32px for dropdown items and panel buttons. This tightness creates breathing room around content without wasted chrome. Sitesnap adopts three explicit heights: `compact` (28px) for workspace-inline micro-actions, `default` (32px) for panel buttons and filter chips, and `large` (40px) for primary CTAs. Desktop pointer targets meet 44px via padding extension, not by increasing visual height.
- **Command palette (`Cmd/Ctrl + K`).** Notion's command palette is a floating, fuzzy-matched list of recent items and available actions — ranked, keyboard-navigable, dismissible with `Escape`. Sitesnap implements this by extending the top-toolbar search bar: when focused via `Cmd/Ctrl + K`, it enters command mode and surfaces quick actions ("Upload photos", "Clear filters", "Go to my location", "Open group: [name]") above address search results. Recent searches and recently viewed groups are prioritised.
- **Contextual micro-toolbar above selections.** When a block is selected in Notion, a compact floating toolbar appears directly above it with the most relevant formatting/action options. Sitesnap uses this pattern for: (a) the selected marker on the map (micro-toolbar shows "View photos", "Edit location", "Deselect"); (b) a highlighted thumbnail card in the workspace pane (micro-toolbar shows "Add to group", "Edit metadata", "Delete").
- **Property-style metadata rows.** Notion database properties render as two-column rows: property name on the left in `--color-text-secondary`, editable value on the right in `--color-text-primary`. Clicking the value activates an inline edit; no separate "Edit" button is required. Sitesnap's image detail view adopts this model: the `[Edit]` button on the metadata block is replaced by clickable value cells that transition into inline inputs on click.
- **Sidebar ghost-reveal on hover.** Notion's sidebar becomes more visible when the mouse enters its zone and fades when the mouse leaves. The expanded state uses a smooth `translateX` slide at 120ms. Sitesnap applies a lighter version of this: the workspace pane has a pull-tab at the right map-edge that, on hover, previews the pane title and group count before the full pane opens. The pane itself does not reserve layout space when collapsed — it overlays the map.
- **Spacing as the separator.** Notion uses almost no visible border lines inside panels. Section grouping is achieved through vertical spacing (`gap-3` / `gap-6`) and subtle background shifts. Sitesnap removes decorative `<hr>` dividers and `--color-border` lines from inside the workspace pane and filter panel; section headers and `gap` spacing replace them.
