---
name: "Styling"
description: "Use when writing styles, Tailwind classes, or SCSS. Covers design tokens, spacing, and visual conventions."
applyTo: "**/*.scss"
---

# Styling Conventions

- **Tailwind CSS** for utility classes in templates
- **SCSS** for component-scoped styles (complex layouts, animations, pseudo-elements)
- **CSS custom properties** for design tokens — never hardcode colors or spacing values
- Dark mode via `[data-theme="dark"]` on ancestor — all colors must use CSS custom properties
- Key tokens: `--color-bg-base`, `--color-bg-surface`, `--color-clay`, `--color-text-primary`, `--color-border`
- Tap targets: ≥48px mobile, ≥44px desktop. Body text ≥14px.
- Transitions: 120–250ms. Debounce: 300ms. Avoid `transition-all`.
- Ghost buttons for secondary actions, filled `--color-clay` for primary CTA only
- Prefer `.ui-container`, `.ui-item`, `.ui-spacer` from `styles.scss` before creating custom layouts
- Full token reference: `docs/design/tokens.md`. Layout: `docs/design/layout.md`. Motion: `docs/design/motion.md`.
