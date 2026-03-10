# Map Shell — Interaction Scenarios

> **Element spec:** [element-specs/map-shell.md](../element-specs/map-shell.md)
> **Blueprint:** [implementation-blueprints/map-shell.md](../implementation-blueprints/map-shell.md)
> **Product use cases:** [UC1](README.md#uc1--technician-on-site-view-history), [UC2](README.md#uc2--clerk-preparing-a-quote), [UC3](README.md#uc3--upload-and-correct-a-new-image)
> **Related specs:** [workspace-pane](../element-specs/workspace-pane.md), [drag-divider](../element-specs/drag-divider.md), [search-bar](../element-specs/search-bar.md), [upload-button-zone](../element-specs/upload-button-zone.md), [photo-marker](../element-specs/photo-marker.md), [image-detail-view](../element-specs/image-detail-view.md)

---

## IS-1: Initial Map Load (spec Actions #1)

**Product context:** Every UC begins here. The technician (UC1) or clerk (UC2) sees the map immediately after login.

```mermaid
sequenceDiagram
    actor User
    participant Router
    participant MapShell
    participant Leaflet
    participant Browser

    User->>Router: Navigate to / (authenticated)
    Router->>MapShell: Render component
    MapShell->>Leaflet: Init map (afterNextRender)
    MapShell->>Browser: Request GPS position
    alt GPS available
        Browser-->>MapShell: Position
        MapShell->>Leaflet: setView(userCoords, 13)
    else GPS denied
        MapShell->>Leaflet: Keep Vienna fallback
    end
    MapShell->>MapShell: queryViewportMarkers() RPC
    Note over MapShell: Sidebar visible (desktop left rail / mobile bottom bar)
    Note over MapShell: Search bar floating top-center
    Note over MapShell: Upload button floating top-right
    Note over MapShell: GPS button floating bottom-right
```

**Expected state after:**

- `placementActive` = false
- `searchPlacementActive` = false
- `uploadPanelOpen` = false
- `workspacePaneOpen` = false
- Map renders with markers from viewport query

---

## IS-2: Open Workspace Pane via Marker Click (spec Actions #3)

**Product context:** UC1 step 6 (tap marker), UC2 step 6 (browse markers).
**Related:** [photo-marker spec](../element-specs/photo-marker.md) §Cluster Click, [workspace-pane spec](../element-specs/workspace-pane.md) §1/§1b

```mermaid
sequenceDiagram
    actor User
    participant Marker
    participant MapShell
    participant WorkspacePane

    User->>Marker: Click single-image marker
    Marker->>MapShell: handlePhotoMarkerClick(key)
    MapShell->>MapShell: setSelectedMarker(key), photoPanelOpen → true
    MapShell->>MapShell: openDetailView(imageId)
    MapShell->>WorkspacePane: Render with clip-path reveal animation
    Note over WorkspacePane: PaneHeader visible with close button
    Note over WorkspacePane: Image detail view shown
```

**For cluster markers:**

```mermaid
sequenceDiagram
    actor User
    participant Cluster
    participant MapShell
    participant WorkspacePane

    User->>Cluster: Click cluster marker
    Cluster->>MapShell: handlePhotoMarkerClick(key)
    MapShell->>MapShell: setSelectedMarker(key), photoPanelOpen → true
    Note over MapShell: count > 1, no openDetailView
    MapShell->>WorkspacePane: Render with Active Selection tab
    Note over WorkspacePane: Shows thumbnail grid for cluster images
```

---

## IS-3: Close Workspace Pane (spec Actions #6)

**Product context:** User is done reviewing; wants to return to map-only view.
**Related:** [workspace-pane spec](../element-specs/workspace-pane.md) §3

```mermaid
sequenceDiagram
    actor User
    participant WorkspacePane
    participant MapShell
    participant Leaflet

    User->>WorkspacePane: Click close button (×)
    WorkspacePane->>MapShell: closeWorkspacePane()
    MapShell->>MapShell: photoPanelOpen → false
    MapShell->>MapShell: detailImageId → null
    MapShell->>MapShell: selectedMarkerKey → null
    Note over MapShell: Pane removed from DOM (@if)
    Note over MapShell: DragDivider removed from DOM
    MapShell->>Leaflet: invalidateSize() (map reclaims space)
```

**Expected state after:**

- `workspacePaneOpen / photoPanelOpen` = false
- `detailImageId` = null
- `selectedMarkerKey` = null

---

## IS-4: Click Empty Map While Pane Open (spec Actions #7)

**Product context:** User clicks a blank area on the map. Deselects the marker but keeps the pane open for continued browsing.

```mermaid
sequenceDiagram
    actor User
    participant MapShell

    User->>MapShell: Click empty map area
    MapShell->>MapShell: handleMapClick()
    MapShell->>MapShell: setSelectedMarker(null)
    Note over MapShell: Marker highlight clears
    Note over MapShell: photoPanelOpen stays true
    Note over MapShell: Pane shows "Select a marker on the map to see photos."
```

---

## IS-5: Upload and Placement Mode (spec Actions #4, #5)

**Product context:** UC3 — upload a new image, place it if no EXIF GPS.
**Related:** [upload-button-zone spec](../element-specs/upload-button-zone.md)

```mermaid
sequenceDiagram
    actor User
    participant UploadPanel
    participant MapShell
    participant Leaflet

    User->>MapShell: Click upload button
    MapShell->>MapShell: uploadPanelPinned → true
    User->>UploadPanel: Select image without GPS EXIF
    UploadPanel->>MapShell: placementRequested(key)
    MapShell->>MapShell: placementActive → true
    MapShell->>Leaflet: Crosshair cursor on map
    Note over MapShell: Placement banner: "Click the map to place the image"
    User->>Leaflet: Click on map
    Leaflet->>MapShell: handleMapClick(latlng)
    MapShell->>UploadPanel: placeFile(key, coords)
    MapShell->>MapShell: placementActive → false
```

### Search pin-drop variant (spec Actions #5):

```mermaid
sequenceDiagram
    actor User
    participant SearchBar
    participant MapShell
    participant Leaflet

    User->>SearchBar: Click "Drop pin" action
    SearchBar->>MapShell: dropPinRequested
    MapShell->>MapShell: searchPlacementActive → true
    MapShell->>Leaflet: Crosshair cursor on map
    Note over MapShell: Placement banner: "Click the map to drop a pin"
    User->>Leaflet: Click on map
    Leaflet->>MapShell: handleMapClick(latlng)
    MapShell->>MapShell: renderSearchLocationMarker(coords)
    MapShell->>MapShell: searchPlacementActive → false
```

---

## IS-6: Browser Resize — Responsive Reflow (spec Actions #2)

**Product context:** Technician switches orientation on tablet, or clerk resizes browser window.

| Breakpoint | Sidebar                     | Workspace Pane           | Upload |
| ---------- | --------------------------- | ------------------------ | ------ |
| ≥ 768px    | Left rail (floating, icons) | Right panel with divider | FAB    |
| < 768px    | Bottom tab bar (full width) | Bottom sheet (40vh)      | FAB    |

No JS needed — CSS media queries handle the reflow. `NavComponent` handles sidebar transformation independently.

---

## Signal naming note

The spec uses `workspacePaneOpen` as the canonical signal name. The current code uses `photoPanelOpen`. These refer to the same state. A rename is planned but deferred to avoid unnecessary churn during active development.
