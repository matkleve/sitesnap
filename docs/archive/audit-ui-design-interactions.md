# UI Design & Interaction Audit

**Date:** 2026-03-04
**Scope:** All pages and shared patterns — search bar, map page, side panel, upload entry point, photos, groups, settings, account, navigation, and cross-cutting micro-interactions.
**Goal:** 100 ideas and issues across the full UI surface. Ranked by impact tier.

---

## Table of Contents

- [Part A — Deep-Dive: Three Key Interaction Patterns](#part-a--deep-dive-three-key-interaction-patterns)
  - [Pattern 1: Search Bar — From Idle to Result](#pattern-1-search-bar--from-idle-to-result)
  - [Pattern 2: Live Marker Highlighting on Search Term](#pattern-2-live-marker-highlighting-on-search-term)
  - [Pattern 3: Side Panel Hover-Expand Lifecycle](#pattern-3-side-panel-hover-expand-lifecycle)
- [Part B — Open UI Backlog (Triaged)](#part-b--open-ui-backlog-triaged)
  - [Backlog Table](#backlog-table)
  - [Recently Closed (Reference)](#recently-closed-reference)
  - [Working Rules](#working-rules)

---

# Part A — Deep-Dive: Three Key Interaction Patterns

---

## Pattern 1: Search Bar — From Idle to Result

### States

The search bar lives in the side panel header. It has five distinct states:

```
Idle → Focused (empty) → Typing → Results → Committed
```

### State 1: Idle

- Single pill-shaped input with a search icon on the left.
- Placeholder text: "Search places or photos…"
- No dropdown.

### State 2: Focused, Empty

Dropdown appears immediately beneath the bar. Content:

```
┌─────────────────────────────────┐
│ 🕐  Battersea Power Station      │  ← most recent search first
│ 🕐  Site 14B, Manchester         │
│ 🕐  51.5074, -0.1278             │
│ ─────────────────────────────── │
│ 🔍  Search your photos           │  ← command shortcut row
└─────────────────────────────────┘
```

- Recent searches come from `localStorage` (max 8 stored, 5 shown).
- Each row: clock icon + label. Clicking it commits the search instantly.
- "Search your photos" row opens a filtered Photos page — it is always present as a fallback.
- Keyboard: `↑`/`↓` navigates rows, `Enter` commits, `Escape` closes.

### State 3: Typing

As soon as the user types, the dropdown splits into two sections separated by a visual divider:

```
┌─────────────────────────────────┐
│ 📷  Site 14B — 3 photos          │  ← DB photo/group results (max 3)
│ 📷  Battersea — 1 photo          │
│ 📁  Battersea site group         │  ← group match
│ ─────────────────────────────── │
│ 📍  Battersea Power Station, …   │  ← geocoding result(s) (max 3)
│ 📍  Battersea Park, London       │
└─────────────────────────────────┘
```

**DB results (top section, max 3):**

- Fuzzy-matched against image metadata, file names, group names, project names.
- Label shows match type icon (📷 photo, 📁 group) and a short snippet.
- Results appear after 200 ms debounce (shorter than map viewport debounce — this is a fast typeahead).
- Each row shows a 24×24 px thumbnail on the right.

**Geocoding results (bottom section, max 3):**

- Provider-agnostic geocoding call (same boundary used elsewhere).
- Fires at the same debounce as DB results, in parallel.
- Label shows a place icon and formatted address.
- If geocoding returns no results, the section is hidden entirely.

**Divider:**

- A 1 px `--color-border` line with a label "Places" on the right side (small, `--color-text-disabled`).
- Not shown if either section is empty.

### State 4: Committed

- Typing a place → map flies to the geocoded coordinates and shows a subtle crosshair pin.
- Typing a photo/group match → side panel transitions to show that item's detail.
- The search term stays in the input (not cleared) so the user can refine.
- A × clear button appears inside the input on the right.
- Committed term is added to `localStorage` recent searches (deduped, most-recent-first).

### Keyboard contract

| Key                        | Behaviour                                               |
| -------------------------- | ------------------------------------------------------- |
| `↓` / `↑`                  | Navigate dropdown rows                                  |
| `Enter`                    | Commit highlighted row (or top row if none highlighted) |
| `Escape`                   | Close dropdown, blur input, cancel any partial search   |
| `Cmd/K`                    | Focus the search bar from anywhere on the map page      |
| `Backspace` on empty input | Clear the committed state (unpin crosshair)             |

### Technical notes

- Dropdown is an **overlay** (not a sibling in flow) — `position: absolute` below the input, `z-index` above the map pane.
- DB results use a Supabase `ilike` full-text match on `images.file_name`, `images.metadata`, `groups.name` — single round-trip.
- Geocoding and DB queries fire in parallel; whichever responds first renders its section; the other fills in when ready without re-ordering the list.
- A skeleton row (1 placeholder per section) shows during loading to prevent layout shift.

---

## Pattern 2: Live Marker Highlighting on Search Term

### Concept

While the user is **actively typing** in the search bar (State 3), map markers whose associated metadata contains the current search term light up visually — without waiting for a committed search or a panel open. The map gives instant spatial feedback.

### Visual Treatment

```
Normal marker:     ● (--color-primary, 20 px)
Highlighted:       ● (--color-clay, 24 px, 2 px white ring, drop-shadow spread)
Dimmed (no match): ● (--color-text-disabled, 16 px, opacity 0.4)
```

Transition: `fill`, `r`, and `filter` CSS properties animate in 80 ms on the SVG/canvas layer (Leaflet's `CircleMarker` or a custom SVG icon layer).

### Rules

- Highlighting fires after **150 ms** of no new keystroke (shorter than viewport debounce — this is visual feedback, not a data fetch).
- Only applies to markers **currently in the viewport** (already loaded — no new fetch triggered).
- If the search term is cleared or `Escape` is pressed, all markers return to normal in 80 ms.
- Clusters do not highlight individually — a cluster badge turns `--color-clay` (with count preserved) if at least one of its constituent images matches.
- If no markers match, all dim down and a brief tooltip near the search bar reads "No photos match this term in the current view" — fades after 3 s.
- This feature is **display-only** — it does not filter out non-matching markers. Filtering is a deliberate committed action.

### Implementation approach

- The component holds a `highlightTerm = signal<string>('')` updated at 150 ms debounce from the search input.
- The map layer iterates over rendered markers and calls a `matchesTerm(marker, term): boolean` helper.
- Matching markers get a CSS class or Leaflet icon swap; non-matching markers get a dimmed icon variant.
- On `highlightTerm()` change, only Leaflet icon objects are swapped — no Supabase round-trip.

### Edge cases

- Very common term (e.g., "a") would highlight almost everything — apply a minimum of 3 characters before highlight activates.
- Term matches a group name but not individual photos → no individual marker highlights; group tab in panel pulses once.

---

## Pattern 3: Side Panel Hover-Expand Lifecycle

### States

```
Collapsed strip  →  Hover-expanded  →  Pinned (marker selected)
      ↑                   ↓                      ↓
   mouseenter          mouseleave              × button
```

### Collapsed strip (at rest)

- Width: **14 px**.
- Full viewport height.
- Background: `--color-bg-surface` (slightly lighter than `--color-bg-base`).
- Right edge: 1 px `--color-border`.
- A centred vertical **pill** (40×4 px, `--color-border-strong`, `border-radius: 2px`) gives a visual affordance — similar to a browser scrollbar thumb. It sits at 50 % height.
- Cursor: `col-resize` on hover over the strip (even before expand, to cue interactivity).

### Hover-expanded

- Width: **320 px**.
- Transition: `width 120ms ease-out`.
- Panel fades in content immediately (no wait for transition end).
- Contains: search bar header, scrollable content area (empty until marker selected), bottom user avatar.
- **Stays open** while cursor is anywhere within the 320 px column.
- **Collapses** on `mouseleave` with same 120 ms transition, **unless** `panelPinned = true`.

### Pinned (marker selected)

- `panelPinned` flips to `true` when any marker is clicked.
- Panel stays at 320 px regardless of hover state.
- A **×** close button appears in the panel header top-right.
- Clicking × sets `panelPinned = false` and clears the selected marker — the panel collapses on next `mouseleave` (or immediately if cursor is already outside).

### Leaflet tile reflow

- `map.invalidateSize()` is called inside a `transitionend` listener on the panel element.
- The listener is added once and uses `{ once: true }` to avoid memory leaks.
- During the 120 ms transition the map is slightly clipped — this is acceptable and preferable to a jarring resize.

---

# Part B — Open UI Backlog (Triaged)

This section replaces the old 100-item mixed registry with a focused **open issues only** backlog.

- Status values: `Open`, `In Progress`, `Done`, `Won’t Do`
- Priority values: `P0` (blocker), `P1` (high), `P2` (polish)
- Milestone values map directly to `docs/milestones.md` (for delivery tracking)

---

## Backlog Table

| ID    | Priority | Status | Area          | Issue                                                                                                           | Milestone      |
| ----- | -------- | ------ | ------------- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| UI-01 | P0       | Open   | Search        | Add committed-state clear `×` control in input; clear query + committed target while preserving active filters. | M-IMPL6        |
| UI-02 | P0       | Open   | Search        | Implement per-user recent searches (`feldpost_recent_searches_<user_id>`) with deduped MRU list.                | M-IMPL6        |
| UI-03 | P0       | Open   | Search        | Focused-empty state must render recent searches and allow one-click commit.                                     | M-IMPL6        |
| UI-04 | P0       | Open   | Search        | Keyboard contract: arrows/Enter/Escape/Cmd(or Ctrl)+K and Backspace-on-empty committed behavior.                | M-IMPL6        |
| UI-05 | P0       | Open   | Search        | Show explicit no-results and loading states without blocking map interaction.                                   | M-IMPL6        |
| UI-06 | P0       | Open   | Search        | Keep dropdown layered above map events (`z-index`) while preserving click behavior.                             | M-IMPL6        |
| UI-07 | P0       | Open   | Map panel     | Build side panel content (`ImageDetailPanelComponent`) for marker/cluster selection.                            | M-UI4          |
| UI-08 | P0       | Open   | Map panel     | Make panel header sticky + content scrollable (`overflow-y: auto`) for long metadata.                           | M-UI4          |
| UI-09 | P0       | Open   | Photos        | Replace placeholder with responsive grid + empty state + cursor pagination.                                     | M-UI6          |
| UI-10 | P0       | Open   | Groups        | Replace placeholder with groups list + detail + create/rename/delete baseline.                                  | M-UI7          |
| UI-11 | P0       | Open   | Settings      | Replace placeholder with `Light/Dark/System` segmented theme control and persisted preference.                  | M-UI8          |
| UI-12 | P0       | Open   | Account       | Replace placeholder with email/password change + delete-account flow.                                           | M-UI9          |
| UI-13 | P1       | Open   | Upload entry  | Complete hover ghost, open/close behavior, outside-click and `Escape` close contract.                           | M-UI5          |
| UI-14 | P1       | Open   | Upload entry  | `dragover` on map pane should open upload panel and show visual drop guidance.                                  | M-UI5          |
| UI-15 | P1       | Open   | Filters       | Add always-visible active filter chips strip; prevent hidden-active-filter state.                               | M-IMPL5, M-UI6 |
| UI-16 | P1       | Open   | Filters       | Add filter panel UI + AND/OR semantics wiring to viewport query state.                                          | M-IMPL5        |
| UI-17 | P1       | Open   | Accessibility | Ensure search dropdown uses `listbox`/`option` roles and proper announcements.                                  | M-IMPL6        |
| UI-18 | P1       | Open   | Accessibility | Ensure all close/icon-only controls meet 44×44 hit-target minimum.                                              | M-UI4, M-UI5   |
| UI-19 | P1       | Open   | Theming       | Apply theme before first paint to avoid flicker.                                                                | M-UI8          |
| UI-20 | P1       | Open   | Theming       | Ensure dark mode updates map tile style immediately when theme toggles.                                         | M-UI8          |
| UI-21 | P2       | Open   | Search        | Optional “Clear history” control at bottom of recent-search list.                                               | M-IMPL6        |
| UI-22 | P2       | Open   | Search        | Add relative timestamps for recent-search items (e.g., “2 hours ago”).                                          | M-IMPL6        |
| UI-23 | P2       | Open   | Photos        | Add sort control (date desc/asc/name).                                                                          | M-UI6          |
| UI-24 | P2       | Open   | Groups        | Preserve scroll position when returning from group detail list.                                                 | M-UI7          |
| UI-25 | P2       | Open   | Motion        | Gate non-essential animations under `prefers-reduced-motion`.                                                   | M-UI1, M-UI3   |

---

## Recently Closed (Reference)

The following high-impact items from the old registry are now delivered and tracked in `docs/milestones.md`:

- Nav accessibility labeling and disabled semantics (`aria-label`, `aria-disabled`, `tabindex`) — M-UI2 ✅
- Panel expand/collapse map reflow (`invalidateSize`) — M-UI3 ✅
- Upload button anchor in map top-right — M-UI5 (partial) ✅
- Placement mode banner/cancel/crosshair behavior — M-IMPL4a ✅

---

## Working Rules

1. New UI issues must be added as one row in the backlog table with priority + milestone.
2. Do not reintroduce a long free-form 100-item list.
3. When an item is complete, mark `Done` and reference the milestone in `docs/milestones.md`.
4. If an item is intentionally deferred, set status to `Won’t Do` with a one-line reason.
