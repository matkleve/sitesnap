---
name: "Leaflet Map"
description: "Use when working with map features, Leaflet, markers, map zones, or the MapAdapter abstraction."
applyTo: "apps/web/src/app/features/map/**"
---

# Leaflet Map Conventions

- **Always use `MapAdapter` abstraction** — never import or call Leaflet APIs directly from components
- Map Shell is the primary screen — all other features are secondary
- Floating/overlay elements (search bar, GPS button, zoom controls) go inside **Map Zone**, not outside Map Shell

## Component Organization

- `map-shell/` — root map page, contains the map and all overlays
- Map Zone — container for floating elements positioned over the map
- Markers (Photo Marker, User Location Marker) — rendered via MapAdapter

## Key Patterns

- Viewport changes trigger data re-queries (Viewport Query Lifecycle)
- Progressive image loading: thumbnail → full resolution
- Map interactions must not block UI thread — debounce rapid pan/zoom

## References

- Map Shell spec: [docs/element-specs/map-shell.md](../../docs/element-specs/map-shell.md)
- Map Zone spec: [docs/element-specs/map-zone.md](../../docs/element-specs/map-zone.md)
- Architecture: [docs/architecture.md](../../docs/architecture.md) (Map Rendering Layer section)
