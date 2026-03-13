# Feldpost – Motion & Transitions

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

### Geometry stability rules

- Shared layout primitives keep their geometry during transitions.
- Panels may animate container width or container height when the interaction requires it.
- Do not animate container padding, row padding, row height, media-column width, item gap, or panel corner radius.
- Sidebar expand/collapse may animate outer container width and label opacity/clipping only.
- Search surfaces may animate revealed container height and content opacity, but keep the same panel radius and container padding as the closed state.
- Search results should reveal within the existing panel surface rather than translating like a detached dropdown.
- If a pill-style treatment causes layout errors, clipping issues, or geometry shifts during state changes, fall back to the standard `.ui-container` panel shape.

| Interaction                  | Effect                                           | Duration | Easing                                   |
| ---------------------------- | ------------------------------------------------ | -------- | ---------------------------------------- |
| Panel slide in/out (desktop) | `transform: translateX`                          | 200ms    | `ease-out`                               |
| Bottom sheet snap (mobile)   | `transform: translateY`                          | 250ms    | `cubic-bezier(0.4, 0, 0.2, 1)`           |
| Marker appear (map load)     | `opacity: 0→1`, slight upward translate          | 150ms    | `ease-out` (staggered by 30ms per batch) |
| Marker tap (highlight)       | `scale: 1→1.2→1.1`                               | 200ms    | spring-like `ease-in-out`                |
| Thumbnail load               | `opacity: 0→1` from placeholder blur             | 300ms    | `ease-out`                               |
| Filter chip add/remove       | `opacity + max-width` (chip appear/collapse)     | 180ms    | `ease-in-out`                            |
| Page navigation              | No full-page transitions; panels update in place | —        | —                                        |

Panel and row geometry remain fixed while these transitions run, including container padding, row padding, media-column width, and panel radius.

`prefers-reduced-motion: reduce` disables all transforms and fades, keeping only immediate state changes.
