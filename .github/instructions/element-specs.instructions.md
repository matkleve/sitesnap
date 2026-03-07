---
name: "Element Specs"
description: "Use when creating or editing element specification documents in docs/element-specs/."
applyTo: "docs/element-specs/**"
---

# Element Spec Conventions

Every UI element must have a spec before implementation. Follow the template exactly.

## Required Sections (in order)

1. **Title + "What It Is"** — 1–2 sentences, plain English
2. **What It Looks Like** — 3–5 sentences, reference design tokens
3. **Where It Lives** — route, parent component, trigger condition
4. **Actions & Interactions** — table with every user action and system response
5. **Component Hierarchy** — tree diagram mapping to Angular components
6. **Data Requirements** — Supabase tables, columns, service methods
7. **State** — name, TypeScript type, default value, what it controls
8. **File Map** — every file to create with a 1-phrase purpose
9. **Wiring** — how it connects to parent (routes, imports, injections)
10. **Acceptance Criteria** — checkbox list, each item testable

## Rules

- Specs are the source of truth — code must match spec, not the other way around
- Update specs BEFORE modifying features
- Use canonical names from [glossary](../../docs/glossary.md)
- Keep "What It Is" and "What It Looks Like" short — detail goes in Actions and Hierarchy
- Use `rem` as the primary unit for accessibility-sensitive UI dimensions: touch targets, button heights, interactive sizes, spacing, and layout dimensions. Include px as an annotation when the exact reference size matters.
- Use `em` only for component-internal spacing that should scale with the component's own font size.
- Use `px` only for precision details that should not scale with font size: borders, outlines, shadows, image display sizes, and pixel-resolution thresholds.
- Use `vh` / `vw` only for viewport-relative layout behavior.

Full template: [docs/agent-workflows/element-spec-format.md](../../docs/agent-workflows/element-spec-format.md)
