# GPS Button

## What It Is

A small floating button that centers the map on the user's current GPS position. Positioned bottom-right of the Map Zone. Triggers the browser Geolocation API via `MapAdapter`, drops/moves the User Location Marker to the fix, and pans the map there.

## What It Looks Like

`2.75rem` circle (desktop / ~44px) / `3rem` circle (mobile / ~48px). `--color-bg-surface` background, crosshair/location icon in `--color-text-primary`. Subtle `box-shadow` (px). Three visual states:

- **Idle**: Default icon, no highlight
- **Seeking**: Pulsing animation while waiting for GPS fix
- **Active**: Icon filled or highlighted to show map is tracking location

> **Unit note:** Sizes use `rem` so the button scales with the user's browser font-size preference (accessibility). Shadow and border values stay in `px` — precision details that should not inflate.

## Where It Lives

- **Parent**: Map Zone (floating)
- **Position**: Bottom Right Corner

## Actions

| #   | User Action                     | System Response                                                    | Triggers                            |
| --- | ------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| 1   | Clicks button (idle)            | Requests GPS fix → pans map to coords → drops User Location Marker | `MapAdapter.panTo()`, marker placed |
| 2   | Clicks button (active/tracking) | Stops tracking, marker stays                                       | Tracking off                        |
| 3   | GPS fix fails                   | Toast notification with error message                              | Toast shown                         |
| 4   | User pans away while tracking   | Tracking stops automatically (or stays — TBD per design decision)  | State update                        |

## Component Hierarchy

```
GpsButton                                  ← 2.75rem/3rem circle, floating bottom-right
├── LocationIcon                           ← crosshair or location pin icon
└── [seeking] PulseRing                    ← CSS animation while awaiting fix
```

## Design Tokens

| Token                   | Value                       | Notes                  |
| ----------------------- | --------------------------- | ---------------------- |
| `--touch-target-base`   | `2.75rem` (≈44px)           | Desktop min tap target |
| `--touch-target-mobile` | `3rem` (≈48px)              | Mobile min tap target  |
| `--radius-circle`       | `50%`                       | Makes it a circle      |
| `--shadow-float`        | `0 2px 8px rgba(0,0,0,0.2)` | px fine for shadows    |
| `--color-bg-surface`    | (from design system)        | Button background      |
| `--color-text-primary`  | (from design system)        | Icon color             |

## Data

| Field         | Source                  | Type                                      |
| ------------- | ----------------------- | ----------------------------------------- |
| User position | Browser Geolocation API | `GeolocationPosition`                     |
| GPS status    | `navigator.geolocation` | `'idle' \| 'seeking' \| 'fix' \| 'error'` |

## State

| Name       | Type                              | Default  | Controls                       |
| ---------- | --------------------------------- | -------- | ------------------------------ |
| `gpsState` | `'idle' \| 'seeking' \| 'active'` | `'idle'` | Button appearance and behavior |

## File Map

| File                                              | Purpose                           |
| ------------------------------------------------- | --------------------------------- |
| `features/map/gps-button/gps-button.component.ts` | Button component                  |
| `core/map-adapter.ts`                             | `getCurrentPosition()`, `panTo()` |

## Acceptance Criteria

- [ ] Floating bottom-right in Map Zone
- [ ] `2.75rem` (≈44px) desktop, `3rem` (≈48px) mobile tap target
- [ ] Pulse animation while seeking GPS
- [ ] Pans map to user location on successful fix
- [ ] Shows toast on GPS failure
- [ ] Places/updates User Location Marker
