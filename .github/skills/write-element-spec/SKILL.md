---
name: write-element-spec
description: "Write a structured element spec for a UI element. Use when planning a new feature before implementation, creating spec documents in docs/element-specs/."
argument-hint: "Element name and brief description"
---

# Write Element Spec

## When to Use

- Planning a new UI element before implementation
- Documenting an existing feature that lacks a spec
- Updating a spec before modifying a feature

## Procedure

### Step 1: Gather Requirements

1. Understand the user's description of the feature
2. Check `docs/glossary.md` — does this element already have a canonical name?
3. If new, propose a glossary entry following existing naming patterns

### Step 2: Research Context

1. Read `docs/design/constitution.md` and `docs/design.md` for always-load design rules
2. Load the relevant task-specific design files from `docs/design/` (`tokens.md`, `layout.md`, `motion.md`, `map-system.md`, `components/*.md`)
3. Read `docs/architecture.md` for layer constraints and adapter patterns
4. Review related specs in `docs/element-specs/` for consistency
5. Check `docs/database-schema.md` for available data sources

### Step 3: Write the Spec

Create `docs/element-specs/{element-name}.md` following the [element spec format](./references/element-spec-format.md):

1. **Title + What It Is** — 1–2 sentences
2. **What It Looks Like** — 3–5 sentences, reference tokens
3. **Where It Lives** — route, parent, trigger
4. **Actions & Interactions** — complete table
5. **Component Hierarchy** — tree diagram
6. **Data Requirements** — tables, columns, methods
7. **State** — name, type, default, controls
8. **File Map** — every file to create
9. **Wiring** — parent integration
10. **Acceptance Criteria** — testable checklist

Unit rules for every new spec:

- Use `rem` as the primary unit for accessibility-sensitive UI dimensions: touch targets, button heights, interactive sizes, spacing, and layout dimensions. Include px as an annotation when the exact reference size matters.
- Use `em` only for component-internal spacing that should scale with the component's own font size.
- Use `px` only for precision details that should not scale with font size: borders, outlines, shadows, image display sizes, and pixel-resolution thresholds.
- Use `vh` / `vw` only for viewport-relative layout behavior.

### Step 4: Validate

- Every Actions row is testable
- Hierarchy maps to Angular components
- File Map paths follow project structure
- All referenced data sources exist in the schema
- Glossary name is consistent

## References

- [Element spec format](./references/element-spec-format.md) — detailed template with rationale
