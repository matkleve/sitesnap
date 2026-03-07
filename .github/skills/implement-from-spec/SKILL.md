---
name: implement-from-spec
description: "Implement or correct a UI element from its element spec document. Use when building a new feature, component, or page from docs/element-specs/. Covers the full workflow: read spec, audit current work, plan, implement, verify, and fix."
argument-hint: "Element spec name or path (e.g., search-bar)"
---

# Implement From Element Spec

## When to Use

- Building a new UI element from an existing element spec
- Finishing or correcting a partially implemented element against its spec
- Implementing a feature that has a spec in `docs/element-specs/`
- Following the Audit → Plan → Implement → Verify → Fix loop

## Procedure

### Step 1: Read the Spec

1. Open `docs/element-specs/{element}.md`
2. Read ALL sections: What It Is, Actions, Hierarchy, State, File Map, Wiring
3. Read `docs/glossary.md` for canonical component names
4. Read `docs/design/constitution.md` and `docs/design.md`
5. Load the relevant task-specific design files from `docs/design/` before implementation

### Step 2: Audit Current Implementation

1. Check whether the element is already partially or fully implemented
2. Compare the current files against the spec's File Map, Actions, State, Wiring, and Acceptance Criteria
3. Mark what is already done, what is missing, and what is incorrect
4. Preserve correct existing work; only change what is needed to bring code back in line with the spec
5. Treat the spec as the source of truth if code and spec disagree

### Step 3: Plan

1. List every file to create (from File Map)
2. List every file to modify (from Wiring section)
3. Map the Component Hierarchy to Angular components
4. Identify service dependencies
5. Translate the audit into a concrete todo list: keep, add, fix, remove
6. Flag any ambiguities or missing information

### Step 4: Implement

1. Create every file listed in the File Map that does not exist yet
2. Update existing files that are incomplete or incorrect
3. Do not rewrite already-correct parts just because they differ stylistically
4. Match the Component Hierarchy **exactly** — each node = a component
5. Implement **every** row from the Actions table
6. Use the exact State variables, types, and defaults
7. Use the exact Data sources and queries
8. Wire into parent per the Wiring section
9. Use design tokens, not hardcoded values

### Step 5: Verify

Run through the [implementation checklist](./references/implementation-checklist.md):

- All File Map files exist
- Component hierarchy matches pseudo-HTML
- All Actions implemented
- All State variables present with correct types
- Design tokens used
- Loading/error/empty states present
- Accessibility attributes as specified
- Build/test/runtime checks from the checklist pass when applicable

### Step 6: Fix and Repeat

1. If verification finds gaps, return to the relevant implementation step and fix them
2. Re-run verification after each fix pass
3. Continue the loop until the spec is satisfied or a real blocker is identified
4. If blocked, report exactly which spec item cannot be completed and why

## Expected Output

1. A short audit summary of what was already implemented correctly
2. A short list of missing or incorrect spec items
3. The code changes required to close those gaps
4. A final verification summary stating what was checked and what remains, if anything
