# GeoSite – Motion & Transitions

Load this file for any task involving animation, timing, or transitions.

## 6. Motion and Transitions

### Motion Overview

```mermaid
flowchart LR
    subgraph PanelMotion["Panel Transitions"]
        P1["Panel slide in/out"] -->|200ms ease-out| P2["translateX"]
        P3["Bottom sheet snap"] -->|250ms cubic-bezier| P4["translateY"]
        P5["Filter panel"] -->|220ms cubic-bezier| P6["translateY -100% → 0"]
    end

    subgraph MarkerMotion["Marker Animations"]
        M1["Marker appear"] -->|150ms ease-out| M2["opacity 0→1 + translate up\nstaggered 30ms/batch"]
        M3["Marker tap"] -->|200ms spring| M4["scale 1→1.2→1.1"]
    end

    subgraph ContentMotion["Content Transitions"]
        C1["Thumbnail load"] -->|300ms ease-out| C2["opacity 0→1 from blur"]
        C3["Filter chip add/remove"] -->|180ms ease-in-out| C4["opacity + max-width"]
        C5["Hover reveal"] -->|80ms| C6["opacity 0→1"]
    end

    RDM["prefers-reduced-motion"] -.->|disables all| PanelMotion
    RDM -.->|disables all| MarkerMotion
    RDM -.->|disables all| ContentMotion
```

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
