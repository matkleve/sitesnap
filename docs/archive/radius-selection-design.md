# Feldpost – Component: Radius Selection

## 5.6 Radius Selection Circle

When the technician long-presses (mobile) or right-click-drags (desktop) the map:

- A blue semi-transparent circle expands from the press point.
- The circle border is `--color-primary` at 60% opacity, 2px dashed stroke.
- The fill is `--color-primary` at 10% opacity.
- A live radius label floats above the circle: `"143 m"`, styled as a small chip with `--color-bg-elevated` background and `--color-text-primary` text.
- Drag handles appear on the circle's cardinal points (N/S/E/W) for resizing after release.
- A ✕ dismiss button appears in the top-right of the map overlay area.
