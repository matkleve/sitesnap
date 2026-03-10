# Sitesnap – Design Constitution

Load this file for every visual or product implementation task. These rules are non-negotiable.

## The User

- Design for the field technician first: sunlight, dirty gloves, one-handed use, and repeated daily workflows.
- If a UI pattern fails for outdoor mobile use, it fails the product.

## The Interface

- The map is the primary canvas. Panels, sheets, and detail views serve the map rather than replacing it.
- Progressive disclosure is mandatory: show essentials first, reveal complexity on demand.
- Quiet actions are the default: secondary controls stay hidden until hover, focus, selection, or explicit mode change.

## Sizes & Touch

- Touch targets scale with browser font size and must remain accessible: mobile targets at least `3rem × 3rem (48×48px)`, desktop targets at least `2.75rem × 2.75rem (44×44px)`.
- Compact visual controls are acceptable only when their real hit area still meets the target minimum via padding or transparent hit zones.
- Layout dimensions, control heights, and spacing follow the rem-first sizing rules in the design token files.

## Color

- Use warm neutrals, not sterile grays or cold blue-blacks.
- The product's own data layer must always be more visually prominent than the base map.
- `--color-clay` is the reserved warm accent for meaningful emphasis, not decoration.

## Buttons

- Filled buttons are reserved for primary actions.
- Secondary actions use ghost buttons.
- Tertiary actions use text-only treatments.
- Correct placement and labeling matter more than decorative emphasis.

## Honesty

- Show corrected locations, active filters, partial loads, and upload failures explicitly.
- Do not present provisional or filtered data as complete.

## Calm

- The interface should feel restrained, not loud.
- Prefer skeletons over spinners, short transitions over flashy animation, and plain language over system jargon.

## Dark Mode

- Dark mode is first-class and uses warm near-black surfaces.
- All components must work in both light and dark themes using tokens, not hardcoded colors.

## Accessibility

- Keyboard navigation, visible focus states, semantic labels, and WCAG AA contrast are baseline requirements.
- Color is never the sole state indicator.

## What Stays In Px

- Borders, outlines, shadows, and other precision strokes stay in px because scaling them with browser font size adds blur rather than accessibility.
- Image display sizes and image-resolution thresholds stay in px because they are media/rendering constraints, not interactive UI dimensions.

## Reference Files Index

- `docs/design.md` — always-load index file with principles, dark mode, accessibility, responsive summary, and design debt.
- `docs/design/tokens.md` — colors, typography, sizing, radius, shadows, iconography.
- `docs/design/map-system.md` — map hierarchy, marker prominence, clustering, and proximity rules.
- `docs/design/layout.md` — breakpoint behavior, panel dimensions, and responsive layout.
- `docs/design/motion.md` — animation timing and transition rules.
- `docs/design/components/*.md` — task-specific component contracts.
- `docs/archive/reference-products.md` — human reading only; do not load in agentic coding sessions.
