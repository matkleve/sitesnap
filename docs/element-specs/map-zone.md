# Map Zone

## What It Is

The central area inside Map Shell that contains the Leaflet map and all floating controls. Everything that overlays the map (search bar, upload button, GPS button, filter chips, placement banner) lives in Map Zone.

## What It Looks Like

Takes all remaining horizontal space after Sidebar (`flex: 1`). The Leaflet map fills it completely. Floating controls are absolutely positioned within it. No visible border or background — the map tiles are the background.

## Where It Lives

- **Parent**: `MapShellComponent` template
- **Not a separate component** — it's a `<div class="map-zone">` in the Map Shell template

## Actions

| #   | User Action                  | System Response                                         | Triggers                        |
| --- | ---------------------------- | ------------------------------------------------------- | ------------------------------- |
| 1   | Pans/zooms map               | Leaflet viewport updates, triggers debounced data query | `MapAdapter.onViewportChange()` |
| 2   | Clicks map (placement mode)  | Places marker at click coordinates                      | `placementActive` → new marker  |
| 3   | Right-click + drag (desktop) | Starts radius selection                                 | Radius Selection Circle appears |
| 4   | Long-press + drag (mobile)   | Starts radius selection                                 | Radius Selection Circle appears |

## Component Hierarchy

```
MapZone                                    ← div, flex-1, relative, overflow-hidden
├── MapContainer                           ← div #mapContainer, absolute inset-0, Leaflet mounts here
│   ├── [placing] crosshair cursor         ← via CSS class --placing
│   └── TileLayer + MarkerLayer            ← managed by MapAdapter, not Angular components
├── SearchBar                              ← absolute top-4 left-1/2, z-30
├── ActiveFilterChips                      ← absolute below search bar, z-20
├── UploadButtonZone                       ← absolute top-4 right-4, z-20
├── GPSButton                              ← absolute bottom-4 right-4, z-20
└── [placement] PlacementBanner            ← absolute bottom-16 center, z-30
```

## Data

No own data — Map Zone is a layout container. Data flows through child components.

## State

No own state — Map Zone is a layout container. State lives in Map Shell and child components.

## File Map

Not a separate component — part of `map-shell.component.html` and `.scss`.

## Acceptance Criteria

- [x] Map tiles fill the entire zone
- [x] Floating controls are positioned correctly and don't overlap
- [x] Placement click only fires when `placementActive` is true
- [x] Map interactions (pan, zoom) work even with floating controls on top
