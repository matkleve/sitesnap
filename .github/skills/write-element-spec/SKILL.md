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

1. Read `docs/design/constitution.md` for non-negotiable design rules
2. Read related specs in `docs/element-specs/` for consistency
3. Check `docs/database-schema.md` for available data sources
4. Only load specific design docs (`docs/design/tokens.md`, `docs/design/layout.md`, `docs/design/motion.md`) if you need them for the spec's "What It Looks Like" section — do NOT load them all by default
5. Check `apps/web/src/styles.scss` for shared primitives (`.ui-container`, `.ui-item`, `.ui-spacer`) the spec should reference

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

When applicable, specs should explicitly call for the shared layout primitives instead of describing one-off row or panel geometry.

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

---

## Spec Update Mode

When the user provides one or more existing spec files and describes features to add, follow this procedure instead of Steps 1–3:

### Step U1: Read Existing Specs

1. Read each spec file the user provides in full
2. Understand the current structure: actions, hierarchy, state, data, wiring

### Step U2: Integrate New Features

For each feature the user describes, update the relevant spec sections:

- **Actions table** — add rows for new user interactions and system responses
- **Component Hierarchy** — add new child components or restructure the tree
- **State table** — add new signals/variables with type, default, and what they control
- **Data Requirements** — add new Supabase tables, columns, RPC calls, or service methods
- **File Map** — add new files that need to be created
- **Acceptance Criteria** — add testable items for each new feature
- **What It Looks Like** / **Wiring** — update if the visual layout or parent integration changes

### Step U3: Cross-Spec Impact Analysis

1. Search `docs/element-specs/` for every spec that references or is referenced by the updated spec (look for component names, signal names, shared state, parent/child relationships)
2. For each related spec, determine if the new features require changes:
   - Does a parent spec need to pass new inputs or handle new outputs?
   - Does a sibling spec need to accommodate new layout or z-index changes?
   - Does a child spec gain new responsibilities or state?
3. Apply the required updates to related specs
4. List all cross-spec changes made so the user has visibility

### Step U4: Validate

Run the same validation as Step 4 above on all modified specs.

## References

- [Element spec format](./references/element-spec-format.md) — detailed template with rationale
