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

1. Open `docs/element-specs/{element}.md` — read ALL sections
2. Open `docs/implementation-blueprints/{element}.md` if it exists — it has exact service signatures, data flows, and queries
3. Only read `docs/design/constitution.md` if this is a new visual component you haven't worked on before
4. Only read specific design docs (`docs/design/tokens.md`, `docs/design/layout.md`, `docs/design/motion.md`, or `docs/design/components/`) if the spec doesn't answer your styling questions — do NOT load them all by default

### Step 2: Audit Current Implementation

1. Check whether the element is already partially or fully implemented
2. Compare the current files against the spec's File Map, Actions, State, Wiring, and Acceptance Criteria
3. Check the spec's Acceptance Criteria checkboxes and identify which items are already verified as done, which are incomplete, and which need re-verification
4. Mark what is already done, what is missing, and what is incorrect
5. Preserve correct existing work; only change what is needed to bring code back in line with the spec
6. Treat the spec as the source of truth if code and spec disagree

### Step 3: Plan

1. List every file to create (from File Map)
2. List every file to modify (from Wiring section)
3. Map the Component Hierarchy to Angular components
4. Identify service dependencies
5. Translate the audit into a concrete todo list: keep, add, fix, remove
6. Flag any ambiguities or missing information

### Step 4: Implement

1. Create any missing infrastructure listed in the blueprint's **Missing Infrastructure** table (services, types, adapters) before building the component
2. Create every file listed in the File Map that does not exist yet
3. Update existing files that are incomplete or incorrect
4. Do not rewrite already-correct parts just because they differ stylistically
5. Match the Component Hierarchy **exactly** — each node = a component
6. Implement **every** row from the Actions table
7. Use the exact State variables, types, and defaults
8. Use the exact Data sources and queries — prefer the blueprint's concrete queries and service signatures over the spec's high-level descriptions when both exist
9. Wire into parent per the Wiring section
10. Use design tokens, not hardcoded values
11. Prefer shared primitives `.ui-container`, `.ui-item`, `.ui-item-media`, `.ui-item-label`, and `.ui-spacer` before creating bespoke layout classes
12. If a decorative shape or animated geometry causes unstable transitions, keep the primitive geometry static and simplify the decoration

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
- **Open the running app in a browser and visually inspect the implemented element.** Start the dev server if it is not already running, navigate to the relevant page/state, and confirm the component renders correctly, responds to interactions (hover, click, drag, keyboard), and matches the spec's "What It Looks Like" description. Take a screenshot if possible.
- Update the spec's Acceptance Criteria checkboxes for items that were verified as complete during this pass
- Leave unchecked any item that is incomplete, unverified, or blocked

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
5. Updated Acceptance Criteria checkboxes in the spec for verified-complete items
