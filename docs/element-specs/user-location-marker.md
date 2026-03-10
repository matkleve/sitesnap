# User Location Marker

## What It Is

A small blue dot on the map showing where the user is currently located, based on the browser Geolocation API. Appears when the user taps the GPS Button.

## What It Looks Like

18px circle in `--color-primary`, 3px white border, subtle outer glow (box-shadow). No tail, no label. Sits at the user's GPS coordinates. Much smaller than photo markers so it doesn't compete visually.

## Where It Lives

- **Parent**: Map Zone (rendered by `MapAdapter`)
- **Appears when**: GPS fix is obtained via GPS Button

## Actions

| #   | User Action                                | System Response                                            | Triggers                    |
| --- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------- |
| 1   | Taps GPS Button                            | Map centers on user location, User Location Marker appears | `MapAdapter.addMarker()`    |
| 2   | User moves (if watching position)          | Marker updates position smoothly                           | Geolocation `watchPosition` |
| 3   | Taps GPS Button again while marker visible | Re-centers map on current position                         | `MapAdapter.setCenter()`    |

## Component Hierarchy

```
UserLocationMarker                         ← Leaflet CircleMarker or DivIcon
└── Dot                                    ← 18px circle, --color-primary, 3px white border, glow
```

## State

Managed by `MapAdapter` / GPS service — not a standalone Angular component.

## File Map

Part of `core/map/leaflet-osm-adapter.ts` (MapAdapter manages this marker).

## Wiring

- Created and managed by `LeafletOsmAdapter` (MapAdapter implementation)
- GPS Button triggers `MapAdapter.showUserLocation()`
- Marker is added/removed from the Leaflet map layer directly by the adapter

## Acceptance Criteria

- [ ] 18px diameter, blue, white border, outer glow
- [ ] Appears only after successful GPS fix
- [ ] Does not obscure nearby photo markers
- [ ] Updates position if Geolocation watch is active
- [ ] Disappears when user navigates away from map page
