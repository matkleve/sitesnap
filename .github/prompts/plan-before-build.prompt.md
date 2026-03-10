---
agent: planner
tools: [read, search, web, todo]
description: "Create an implementation plan from an element spec before writing any code."
---

Before writing code, create an implementation plan for the element spec.

## Instructions

1. Read the element spec from `docs/element-specs/`
2. Read `docs/architecture.md` and `docs/glossary.md` for context
3. Produce this plan:

### Files to Create

List every new file with a 1-sentence purpose.

### Files to Modify

List every existing file that must change (parent components, routes, module imports).

### Component Tree

Show the Angular component tree as nested bullets matching the pseudo-HTML.

### Service Dependencies

List which existing services are needed and any new services to create.

### Questions

List anything ambiguous or missing in the spec that would block implementation.

## Do NOT write implementation code yet.
