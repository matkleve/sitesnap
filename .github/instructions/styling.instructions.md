---
name: "Styling"
description: "Use when writing styles, Tailwind classes, or SCSS. Covers design tokens, spacing, and visual conventions."
applyTo: "**/*.scss, **/*.component.html"
---

# Styling Conventions

## Approach

- **Tailwind CSS** for utility classes in templates
- **SCSS** for component-scoped styles (complex layouts, animations, pseudo-elements)
- **CSS custom properties** for design tokens — never hardcode colors or spacing values

## Design Tokens

| Token                | Light           | Dark    | Usage                       |
| -------------------- | --------------- | ------- | --------------------------- |
| `--color-bg-base`    | #F9F7F4         | #0F0E0C | Page background             |
| `--color-bg-surface` | —               | —       | Card/panel backgrounds      |
| `--color-clay`       | warm terracotta | —       | Primary accent, CTA buttons |

## Sizing & Spacing

- Tap targets: ≥48px mobile, ≥44px desktop
- Body text minimum: 14px / 0.875rem
- Use Tailwind spacing scale (`p-2`, `gap-3`, etc.) — avoid arbitrary values

## Motion

- Transitions: 120–250ms
- Debounce: 300ms default
- Use `transition-colors`, `transition-opacity` — avoid `transition-all`

## Patterns

- Ghost buttons for secondary actions, filled buttons for primary CTA only
- Hover-to-reveal for card actions (Quiet Actions principle)
- Dark mode via `[data-theme="dark"]` on ancestor — use token-based colors, not hardcoded

Load order:

- Always: [docs/design/constitution.md](../../docs/design/constitution.md), [docs/design.md](../../docs/design.md)
- Styling/sizing: [docs/design/tokens.md](../../docs/design/tokens.md)
- Layout: [docs/design/layout.md](../../docs/design/layout.md)
- Motion: [docs/design/motion.md](../../docs/design/motion.md)
- Map hierarchy: [docs/design/map-system.md](../../docs/design/map-system.md)
- Component-specific rules: [docs/design/components/](../../docs/design/components/)
