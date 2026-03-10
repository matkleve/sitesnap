---
name: "Design System"
description: "Use when implementing visual UI in Angular templates. Key design tokens and layout patterns."
applyTo: "**/*.component.html"
---

# Design System Quick Reference

- All colors via CSS custom properties: `--color-bg-base`, `--color-bg-surface`, `--color-clay`, `--color-text-primary`, `--color-border`
- Dark mode: `[data-theme="dark"]` on ancestor. Never hardcode hex.
- Tap targets: ≥48px mobile, ≥44px desktop. Body text ≥14px.
- Map-primary layout: map fills viewport, everything else overlays or docks
- Progressive disclosure: show essentials first, details on demand
- Ghost buttons for secondary actions, filled `--color-clay` for primary CTA
- Prefer `.ui-container`, `.ui-item`, `.ui-spacer` from `styles.scss` before custom layouts
- Transitions: 120–250ms, debounce 300ms, avoid `transition-all`
- Full token details: `docs/design/tokens.md`

## Template Conventions

- Match the component hierarchy from the element spec exactly
- Implement ALL listed actions — do not skip any
- Use `@if`, `@for`, `@switch` control flow (not `*ngIf`, `*ngFor`)
- Always provide loading, error, and empty states
