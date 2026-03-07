---
name: implement-from-spec
description: "Implement a UI element from its element spec document. Use when building a new feature, component, or page from docs/element-specs/. Covers the full workflow: read spec, plan, implement, verify."
argument-hint: "Element spec name or path (e.g., search-bar)"
---

# Implement From Element Spec

## When to Use

- Building a new UI element from an existing element spec
- Implementing a feature that has a spec in `docs/element-specs/`
- Following the Plan → Implement → Verify workflow

## Procedure

### Step 1: Read the Spec

1. Open `docs/element-specs/{element}.md`
2. Read ALL sections: What It Is, Actions, Hierarchy, State, File Map, Wiring
3. Read `docs/glossary.md` for canonical component names
4. Read `docs/design/constitution.md` and `docs/design.md`
5. Load the relevant task-specific design files from `docs/design/` before implementation

### Step 2: Plan

1. List every file to create (from File Map)
2. List every file to modify (from Wiring section)
3. Map the Component Hierarchy to Angular components
4. Identify service dependencies
5. Flag any ambiguities or missing information

### Step 3: Implement

1. Create every file listed in the File Map
2. Match the Component Hierarchy **exactly** — each node = a component
3. Implement **every** row from the Actions table
4. Use the exact State variables, types, and defaults
5. Use the exact Data sources and queries
6. Wire into parent per the Wiring section
7. Use design tokens, not hardcoded values

### Step 4: Verify

Run through the [implementation checklist](./references/implementation-checklist.md):

- All File Map files exist
- Component hierarchy matches pseudo-HTML
- All Actions implemented
- All State variables present with correct types
- Design tokens used
- Loading/error/empty states present
- Accessibility attributes as specified

## References

- [Element spec format](./references/element-spec-format.md) — what each section means
- [Implementation checklist](./references/implementation-checklist.md) — post-build verification
