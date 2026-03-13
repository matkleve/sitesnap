# Feldpost – Product Design

**Who this is for:** designers, frontend engineers, and anyone shaping how Feldpost looks and behaves.  
**What you'll get:** the always-load design context — principles, dark mode, accessibility, responsive quick reference, design debt, and links to smaller task-specific design files.

See `architecture.md` for technical constraints that affect layout decisions.

---

## Design File Index

- `docs/design/constitution.md` — non-negotiable design rules; always load for visual and product implementation tasks.
- `docs/design/tokens.md` — load for styling, sizing, colors, typography, radius, shadows, and iconography.
- `docs/design/map-system.md` — load for map hierarchy, marker prominence, clustering, and proximity behavior.
- `docs/design/layout.md` — load for breakpoints, panel dimensions, and responsive behavior.
- `docs/design/motion.md` — load for animation, timing, and transitions.
- `docs/design/components/empty-states.md` — load for empty-state structure and messaging.

Archived design/components/ files have been superseded by their element specs:

- marker → `docs/element-specs/photo-marker.md`
- filter-panel → `docs/element-specs/filter-panel.md`
- workspace-pane → `docs/element-specs/workspace-pane.md`
- image-detail → `docs/element-specs/image-detail-view.md`
- upload-flow → `docs/element-specs/upload-panel.md` + `upload-button-zone.md`
- radius-selection → `docs/element-specs/radius-selection.md`

---

## 1. Design Principles

These principles filter every design decision. When choices conflict, this order resolves the tie. Principles 1–4 govern utility; principles 5–7 govern character and feel.

### 1.1 Field-First

The technician using this app in direct sunlight, with dirty gloves, at arm's length is the hardest user to serve. If a UI element works for them, it works for everyone. Consequences:

- Tap targets ≥ 3rem × 3rem (48×48px) on mobile, 2.75rem × 2.75rem (44×44px) on desktop.
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
- **Proximity-first marker logic:** marker rendering and clustering are driven by spatial proximity, not by fixed zoom-level bands. Nearby photos may cluster at any zoom if density would hurt readability.

### 1.4 Legibility in All Conditions

Outdoor light, dark basements, OLED phones, wide-gamut monitors — the product must be readable everywhere. Consequences:

- Full dark mode, matching the system preference by default.
- Map tiles swap to a dark style in dark mode.
- Text never renders below 4.5:1 contrast ratio (WCAG AA).
- Minimum body type size: 14px / 0.875rem.
- **Markers are legible on any tile background.** Every map pin has a 2px white outline and a subtle drop shadow so it reads equally well against satellite imagery (bright desert, dark forest canopy, urban rooftop) as against styled vector tiles.

### 1.5 Warmth Over Sterility

_Inspired by Anthropic's design philosophy._ Cold, clinical UIs communicate distance. Feldpost is a tool people use every day on job sites — it should feel grounded and human. Warmth is embedded in the palette (off-white rather than pure white, near-black with a warm tint rather than cold blue-black), the type system (generous line-height, readable body sizes), and the language used in labels and empty states (plain, direct, never corporate).

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

### 1.8 Quiet Actions

_Inspired by Notion's interaction design._ Controls that are always visible create visual noise and compete with the primary content. Actions should be present when needed and invisible when not. This complements Progressive Disclosure (1.3) at the micro-interaction level — where 1.3 governs what features are exposed, 1.8 governs when controls are visually present. Consequences:

- Thumbnail card actions (checkbox, group-add, context menu `⋯`) are invisible at rest. They appear on hover via `opacity: 0 → 1` in 80ms with no layout shift. On mobile, selection checkboxes are always visible in bulk-select mode; at rest they are hidden.
- Secondary and tertiary buttons render as **ghost buttons** — transparent background, no border — and receive a subtle background fill only on hover. Visual weight matches usage frequency: filled = primary action (e.g., "Confirm upload", "Save correction"), ghost = secondary (e.g., "Edit location", "Add to group"), text-only = tertiary (e.g., "Reset to EXIF").
- Context menus are the preferred surface for item-level operations (rename group, delete image, copy coordinates). A permanently visible action bar is only used in bulk-select mode.
- The floating micro-toolbar appears directly above a selected marker or highlighted thumbnail card. It never appears at the bottom of the screen where it competes with the bottom sheet, and never off to the side where it obscures adjacent content.
- The sidebar panel does not display tooltips, hover labels, or animation hints when the user is not actively interacting with it.
- Decorative dividers (horizontal rules between sections) are removed wherever background colour shift and spacing alone are sufficient to establish grouping.

---

## 7. Dark Mode

Dark mode is first-class, not an afterthought. Every component ships with dark-mode Tailwind variants.

Dark mode is inspired directly by Anthropic's approach to Claude: **warm, not cold**. Most dark UIs skew blue-black (cold, techy). Feldpost's dark mode skews toward a warm near-black — the same instinct that makes a physical notebook feel more comfortable than a screen.

**Design rules for dark mode:**

1. **Backgrounds are warm near-black, never cold blue-black and never pure black.** `--color-bg-base: #0F0E0C`. The slight warm tint (+2 red, -2 blue relative to neutral) is not consciously perceptible but produces a measurably more comfortable reading environment for extended field use.
2. **Three-level warm surface hierarchy.** `#0F0E0C → #1A1917 → #252320`. Each step is a ~7-8% luminance lift. The warm tint is preserved at each level. This mirrors Anthropic's surface system and avoids the harsh contrast that cold-gray dark themes create between surface layers.
3. **Primary color brightens slightly.** `--color-primary: #2563EB` (light) → `#3B82F6` (dark). On a dark surface, the lighter blue maintains equivalent perceived contrast without oversaturating.
4. **Clay accent stays warm in dark mode.** `--color-clay: #D9895A` (dark) — slightly lighter and more saturated than the light-mode value to compensate for the dark background. This is the only warm-hued element in the dark UI; its rarity makes upload CTAs unmistakeable.
5. **Borders are warm and subtle.** `--color-border: #2E2B27` — a warm dark brown, barely visible but enough to delineate panels without harsh lines.
6. **Map tile: CartoDB Dark Matter.** The dark tile URL is configured in `LeafletOSMAdapter.darkTileUrl`. The tile's dark neutral palette blends naturally with `--color-bg-base`. Markers with white outlines and shadows read clearly against it.
7. **Image thumbnails need no special treatment.** Photos are self-contained; they do not invert or adapt.
8. **User preference persisted to `localStorage` as `feldpost-theme: 'dark' | 'light' | 'system'`.** Default: `'system'` (follows OS preference).
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

| Breakpoint          | Map                        | Workspace                       | Filters            | Sidebar                    | Upload             |
| ------------------- | -------------------------- | ------------------------------- | ------------------ | -------------------------- | ------------------ |
| Mobile `< 768px`    | Full bleed                 | Bottom sheet (3 snaps)          | Bottom modal       | Hamburger                  | FAB (bottom-right) |
| Tablet `768–1023px` | Full width                 | Slide-over drawer               | Sheet              | Icon-only sidebar          | Toolbar button     |
| Desktop `≥ 1024px`  | Left pane, fills remaining | Right pane (22.5rem, resizable) | Drops from toolbar | Left sidebar (collapsible) | Toolbar button     |

---

## 10. Design Debt and Future Considerations

These are intentional deferrals, not oversights.

1. **Custom typeface:** the system-font stack is chosen for performance on low-end field devices. A brand typeface (e.g., Inter as a web font) is a post-MVP refinement. If Inter is adopted, preload the variable font subset (latin, weights 400+600 only) to avoid FOUT on field devices.
2. **Illustration library:** empty-state illustrations are specified but not yet designed. They should be warm, line-art SVGs that use `currentColor` so they adapt to both light and dark mode without duplication. Style reference: Anthropic's own illustrated brand assets — warm, approachable, hand-drawn-feeling without being cartoonish.
3. **Tile styling:** the plan to strip default OSM tiles (see `docs/design/map-system.md`) requires a Mapbox Studio account or Stadia custom style. For MVP, use CartoDB Light (Positron) in light mode — it is already significantly cleaner than stock OSM. Apply full brand tile styling post-MVP.
4. **Animation library:** motion guidelines are defined but implementation uses vanilla CSS transitions. A dedicated animation system (Angular Animations) is post-MVP.
5. **Onboarding / first-use tour:** defined only at the empty-state level. A guided walkthrough for new users is post-MVP.
6. **Heatmap / density overlay:** post-MVP. Map layer capability (tile swapping via `MapAdapter`) is already designed to support it.
7. **Before/after slider component:** post-MVP feature but the full-image viewer layout anticipates it.
8. **Brand color finalization:** `--color-primary: #2563EB` (blue) is a working default. The warm palette overall (Principle 1.5, Section 7) is confirmed as the design direction. The clay accent (`--color-clay: #CC7A4A`) is confirmed. Primary blue is the only open question before MVP launch.
9. **Marker overlap displacement and dynamic pointer tails:** when two or more square markers overlap in screen space, markers should separate so all squares are visible while tails still point to true coordinates. Defer to post-MVP if needed; MVP must keep square body + pointer shape and avoid hidden marker bodies.
