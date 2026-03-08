# Drag Divider

## What It Is

A vertical resize handle between the Map Zone and Workspace Pane. Lets the user drag to resize the workspace width on desktop. On mobile, hidden — the bottom sheet uses snap points instead.

## What It Looks Like

A thin vertical bar (2px visual width, `--color-border` at rest) occupying the full height between map and workspace. Nearly invisible at rest — follows the Quiet Actions principle (constitution §1.8, Notion-inspired). On hover or active drag, the bar subtly widens and a centered **grip indicator** fades in: three short horizontal lines stacked vertically with `--spacing-1` (4px) gap, rendered in `--color-text-disabled`. The grip area inherits its vertical padding from `--container-padding-block-compact` (matching `.ui-item` row density) and its horizontal padding from `--container-padding-inline-compact` to create a transparent hit zone that meets the 2.75rem (44px) desktop touch-target minimum. `cursor: col-resize` on the full hit zone. On drag, the bar background shifts to `--color-border-strong`.

## Where It Lives

- **Parent**: `MapShellComponent` template, between Map Zone and Workspace Pane
- **Appears when**: `workspacePaneOpen` is `true` (desktop only, hidden at `< 768px`)
- **Component**: `DragDividerComponent` at `features/map/workspace-pane/drag-divider/`

## Actions

| #   | User Action                            | System Response                                                                                               | Triggers                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Hovers over divider zone               | Bar widens to 4px, color shifts to `--color-border-strong`, grip lines fade in (80ms)                         | CSS `:hover` state                       |
| 2   | Presses pointer down on divider        | Enters drag state: bar stays highlighted, user-select disabled on body, `cursor: col-resize` forced globally  | `dragging` signal → `true`               |
| 3   | Moves pointer while dragging           | Workspace pane width updates in real time, clamped to min 17.5rem (280px) and map-pane minimum ~20rem (320px) | Emits `widthChange` with new width in px |
| 4   | Releases pointer                       | Exits drag state: bar returns to rest state, user-select re-enabled                                           | `dragging` signal → `false`              |
| 5   | Double-clicks the divider              | Resets workspace pane to default width (22.5rem / 360px)                                                      | Emits `widthChange` with default width   |
| 6   | Presses Left/Right arrow while focused | Resizes workspace in 0.5rem (8px) steps, clamped to same min/max                                              | Emits `widthChange`, ARIA value updates  |
| 7   | Presses Home/End while focused         | Home: sets workspace to minimum width. End: expands to available max.                                         | Emits `widthChange`, ARIA value updates  |
| 8   | Screen resizes below 768px             | Divider is hidden (mobile uses bottom sheet snap points)                                                      | Angular `@if` / CSS media query          |

## Component Hierarchy

```
DragDivider                                ← host element, full height, col-resize cursor
├── HitZone                                ← transparent tap target, min-width 2.75rem (44px)
│   ├── Bar                                ← 2px visual line, centered in hit zone, --color-border
│   └── GripIndicator                      ← centered vertically in hit zone
│       ├── GripLine                        ← short horizontal line (1rem wide × 1px), --color-text-disabled
│       ├── GripLine                        ← spaced --spacing-1 (4px) apart
│       └── GripLine                        ← 3 lines total
```

### Grip indicator details

The grip indicator is the centered visual affordance. It uses existing design token spacing to stay consistent with UI density:

- **Grip line dimensions**: `1rem` wide × `1px` tall, `--color-text-disabled` (fades to `--color-text-secondary` on hover)
- **Grip line gap**: `--spacing-1` (4px) between each line
- **Vertical position**: centered in the divider's full height
- **Horizontal position**: centered in the hit zone
- **Visibility**: `opacity: 0` at rest → `opacity: 1` on hover/focus/drag, transitions over 80ms

This follows the standard resizable-pane grip pattern used by VS Code, Notion, and Figma: three short parallel lines perpendicular to the drag direction, centered on the separator.

## Data Requirements

None — the Drag Divider is purely a layout interaction component with no data dependencies.

## State

| Name       | Type      | Default | Controls                                                           |
| ---------- | --------- | ------- | ------------------------------------------------------------------ |
| `dragging` | `boolean` | `false` | Bar highlight, grip visibility, global cursor lock, body no-select |

### Inputs (from parent)

| Name           | Type     | Description                                                               |
| -------------- | -------- | ------------------------------------------------------------------------- |
| `currentWidth` | `number` | Current workspace pane width in px                                        |
| `minWidth`     | `number` | Minimum workspace width (280px / 17.5rem)                                 |
| `maxWidth`     | `number` | Maximum workspace width (computed from viewport minus map minimum ~320px) |
| `defaultWidth` | `number` | Default width for double-click reset (360px / 22.5rem)                    |

### Outputs (to parent)

| Name          | Type                   | Description                                           |
| ------------- | ---------------------- | ----------------------------------------------------- |
| `widthChange` | `EventEmitter<number>` | New workspace width in px after drag or keyboard step |

## File Map

| File                                                                   | Purpose                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| `features/map/workspace-pane/drag-divider/drag-divider.component.ts`   | Component with pointer tracking + keyboard logic |
| `features/map/workspace-pane/drag-divider/drag-divider.component.html` | Template: hit zone, bar, grip indicator          |
| `features/map/workspace-pane/drag-divider/drag-divider.component.scss` | Styles: rest/hover/active states, grip lines     |

## Wiring

- Imported in `MapShellComponent`, rendered between Map Zone and Workspace Pane when `workspacePaneOpen` is `true`
- `MapShellComponent` passes `currentWidth`, `minWidth`, `maxWidth`, `defaultWidth` as inputs
- `MapShellComponent` listens to `widthChange` output and applies the new width to the Workspace Pane flex-basis
- Hidden at `< 768px` — mobile layout uses bottom sheet snap points instead
- During drag, the component adds `user-select: none` to `document.body` and sets `cursor: col-resize` on the root element to prevent text selection and cursor flicker
- On `pointerup` or `pointercancel` (even outside the component), drag ends and cleanup runs

## Accessibility

- `role="separator"` with `aria-orientation="vertical"`
- `aria-valuenow`: current workspace width (unitless px)
- `aria-valuemin`: minimum workspace width
- `aria-valuemax`: maximum workspace width
- `tabindex="0"` for keyboard focus
- Visible focus ring using `--color-primary` outline (2px, offset 2px)
- Arrow keys resize in 0.5rem (8px) steps; Home/End jump to min/max
- `prefers-reduced-motion: reduce` disables the grip fade transition (immediate show/hide)

## Acceptance Criteria

- [ ] Divider renders as a 2px vertical line between map and workspace on desktop
- [ ] Hit zone is at least 2.75rem (44px) wide for accessible pointer targeting
- [ ] Hover shows the grip indicator (3 horizontal lines) with 80ms fade-in
- [ ] Pointer drag resizes workspace pane in real time
- [ ] Width is clamped: workspace min 17.5rem (280px), map min ~20rem (320px)
- [ ] Double-click resets workspace to default width (22.5rem / 360px)
- [ ] Keyboard arrow keys resize in 0.5rem (8px) steps
- [ ] `role="separator"` with correct ARIA value attributes
- [ ] Visible focus ring on keyboard navigation
- [ ] Hidden on mobile (`< 768px`)
- [ ] All colors use design tokens, works in both light and dark mode
- [ ] No text selection or cursor flicker during drag
- [ ] `prefers-reduced-motion` disables fade transitions
