---
agent: reviewer
tools: [read, search]
description: "Audit the current UI implementation against design tokens, accessibility, and spec compliance."
---

Audit the current implementation for design and accessibility compliance.

## Instructions

1. Read `docs/design/constitution.md` and `docs/design.md`
2. Load the relevant task-specific files from `docs/design/` (`tokens.md`, `layout.md`, `motion.md`, `map-system.md`, `components/*.md`)
3. Read `docs/glossary.md` for canonical element names
4. For each component in the target area:

### Design Token Compliance

- [ ] Uses CSS custom properties (`--color-*`, `--radius-*`) not hardcoded values
- [ ] Colors match the design token table
- [ ] Spacing follows 4px grid (0.25rem increments)
- [ ] Border radius uses `--radius-md` (0.5rem) or `--radius-full`
- [ ] Shadows use `--shadow-card` or `--shadow-dropdown`

### Layout & Sizing

- [ ] Touch targets ≥ 48px on mobile
- [ ] Content areas use appropriate max-width
- [ ] Responsive breakpoints: sm (640px), md (768px), lg (1024px)

### Motion

- [ ] Transitions use `150ms ease` for micro-interactions
- [ ] Panels use `200ms ease` for open/close
- [ ] No jarring or missing transitions

### Accessibility

- [ ] Semantic HTML elements used
- [ ] ARIA roles and labels present where needed
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 large text)

### Quiet Actions Pattern

- [ ] Card actions hidden until hover (desktop)
- [ ] Card actions always visible on mobile
- [ ] Ghost buttons for secondary actions

## Report Format

For each finding:

- ✅ Compliant
- ❌ Non-compliant → what's wrong and the fix
- ⚠️ Partially compliant → explain
