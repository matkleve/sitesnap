---
name: "Design System"
description: "Use when implementing UI, styling, layout, or visual components. Contains design tokens, spacing scale, and visual conventions."
applyTo: "**/*.component.html, **/*.component.ts, **/*.scss"
---

# Design System Quick Reference

## Color Tokens

| Token                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `--color-bg-base`        | Page background (#F9F7F4 light / #0F0E0C dark) |
| `--color-bg-surface`     | Card and panel backgrounds                     |
| `--color-clay`           | Primary accent — warm terracotta               |
| `--color-clay-hover`     | Hover state for primary                        |
| `--color-text-primary`   | Main body text                                 |
| `--color-text-secondary` | Muted / supporting text                        |
| `--color-border`         | Default border color                           |

## Sizing

- Tap targets: ≥48px mobile, ≥44px desktop
- Body text minimum: 14px / 0.875rem
- Icon size: 20–24px default
- Border radius: use Tailwind scale (`rounded`, `rounded-lg`)

## Motion

- Micro-interactions: 120ms
- Panel transitions: 200–250ms
- Debounce inputs: 300ms
- Easing: `ease-in-out` default
- Avoid `transition-all` — specify properties explicitly

## Layout Principles

- **Map-primary**: map fills viewport, everything else overlays or docks
- **Progressive disclosure**: show essentials first, details on demand
- **Quiet Actions**: hover-to-reveal for secondary actions on cards
- Ghost buttons for secondary actions, filled `--color-clay` for primary CTA

## Dark Mode

- Toggle via `[data-theme="dark"]` on ancestor element
- All colors must use CSS custom properties — never hardcode hex values
- Test both themes when modifying any visual component

Load order:

- Always: [docs/design/constitution.md](../../docs/design/constitution.md), [docs/design.md](../../docs/design.md)
- Styling/sizing: [docs/design/tokens.md](../../docs/design/tokens.md)
- Layout: [docs/design/layout.md](../../docs/design/layout.md)
- Motion: [docs/design/motion.md](../../docs/design/motion.md)
- Map hierarchy: [docs/design/map-system.md](../../docs/design/map-system.md)
- Component-specific rules: [docs/design/components/](../../docs/design/components/)
