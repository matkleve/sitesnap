# Map Shell

## What It Is

The top-level full-screen host component for the map page. It's the main screen of GeoSite — everything the user sees after login lives inside Map Shell.

## What It Looks Like

Full viewport, horizontal flex row. Left: Sidebar. Center: Map Zone (fills remaining space). Right: Workspace Pane (slides in when opened). Background: `--color-bg-base`. No chrome, no header bar — the map dominates.

## Where It Lives

- **Route**: `/` (default route, guarded by auth)
- **Parent**: `AppComponent` via router outlet
- **Component**: `MapShellComponent` at `features/map/map-shell/`

## Actions

| #   | User Action                       | System Response                                                                                         | Triggers                       |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | Navigates to `/` (authenticated)  | Renders full map shell with sidebar, map, floating controls                                             | Map init via `MapAdapter`      |
| 2   | Resizes browser window            | Layout reflows: sidebar collapses to bottom bar on mobile (<768px), workspace pane becomes bottom sheet | Responsive breakpoint          |
| 3   | Opens workspace pane              | Drag Divider appears, map zone shrinks                                                                  | Workspace Pane slides in       |
| 4   | Enters placement mode             | Map Container gets crosshair cursor, Placement Banner appears                                           | `placementActive` signal       |
| 5   | Requests pin-drop from search bar | Map enters pin-drop mode (crosshair cursor, placement banner with "Click the map to drop a pin")        | `searchPlacementActive` signal |

## Component Hierarchy

```
MapShell                                   ← full viewport, flex row, --color-bg-base
├── [future] Sidebar                       ← left rail (desktop) or bottom bar (mobile)
├── UploadButtonZone                       ← fixed top-right, z-20 (visually over map)
├── MapZone                                ← flex-1, holds map + all floating elements
│   ├── MapContainer                       ← div where Leaflet mounts
│   ├── SearchBar                          ← floating top-center, z-30
│   ├── GPSButton                          ← floating bottom-right
│   ├── [future] ActiveFilterChips         ← strip below search bar (when filters active)
│   └── [placement] PlacementBanner        ← bottom-center pill
├── [workspace open] DragDivider           ← resize handle (see drag-divider spec)
└── [workspace open] WorkspacePane         ← right panel (desktop) or bottom sheet (mobile)
```

## State

| Name                    | Type      | Default | Controls                                             |
| ----------------------- | --------- | ------- | ---------------------------------------------------- |
| `placementActive`       | `boolean` | `false` | Crosshair cursor on map, placement banner visibility |
| `searchPlacementActive` | `boolean` | `false` | Crosshair cursor on map for search pin-drop          |
| `uploadPanelOpen`       | `boolean` | `false` | Upload panel expanded/collapsed                      |
| `workspacePaneOpen`     | `boolean` | `false` | Workspace pane visibility + drag divider             |

## File Map

| File                                              | Purpose                         |
| ------------------------------------------------- | ------------------------------- |
| `features/map/map-shell/map-shell.component.ts`   | Host component (already exists) |
| `features/map/map-shell/map-shell.component.html` | Template (already exists)       |
| `features/map/map-shell/map-shell.component.scss` | Layout styles (already exists)  |

## Wiring

- Loaded via Angular Router at `/` with `authGuard`
- Initializes Leaflet in `afterNextRender` (browser-only)
- All child floating components are positioned via CSS within Map Zone
- Never calls Leaflet directly from template — uses `MapAdapter`

## Acceptance Criteria

- [x] Full viewport with no scrollbars
- [ ] Sidebar on left (desktop) / bottom (mobile)
- [x] Map fills remaining space
- [x] Floating controls (search, upload, GPS) don't overlap each other
- [ ] Workspace pane slides in from right without pushing sidebar
- [x] Placement mode adds crosshair cursor to map
- [ ] Works on mobile: sidebar → bottom bar, workspace → bottom sheet
