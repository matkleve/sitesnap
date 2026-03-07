# Documentation — Package Guidelines

## Element Specs

- Every UI element has a spec in `element-specs/` — this is the **implementation contract**
- Specs are the source of truth: code must match spec, not the other way around
- Update specs **before** asking agents to modify features
- Follow the template in `agent-workflows/element-spec-format.md` exactly

## Glossary

- `glossary.md` defines canonical UI element names (e.g., "Search Bar", "Photo Marker", "Workspace Pane")
- Always use glossary names in code, comments, and specs — no synonyms

## Writing Conventions

- Keep "What It Is" and "What It Looks Like" sections short — detail goes in Actions and Hierarchy
- Every Actions table row must be testable
- Component hierarchies use tree diagrams that map directly to Angular components

## Design Reference Loading

- Always load `design/constitution.md` and `design.md`
- Load `design/tokens.md` for visual styling, sizing, or color work
- Load `design/layout.md` for breakpoints and panel dimensions
- Load `design/motion.md` for animation and transition work
- Load `design/map-system.md` for clustering, marker prominence, and map interaction rules
- Load the relevant file from `design/components/` for the element being implemented
- Do not load `design/reference-products.md` in agentic coding sessions
