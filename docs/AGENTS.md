# Documentation — Package Guidelines

## Element Specs

- Every UI element has a spec in `element-specs/` — this is the **implementation contract**
- Specs are the source of truth: code must match spec, not the other way around
- Update specs **before** modifying features
- Follow the template in `agent-workflows/element-spec-format.md`

## Glossary

- `glossary.md` defines canonical UI element names — always use these in code and specs

## Design Docs

- `design/constitution.md` — non-negotiable design rules
- `design/tokens.md` — colors, typography, sizing
- `design/layout.md` — breakpoints, panel dimensions
- `design/motion.md` — animation timing
- `design/map-system.md` — map hierarchy, markers, clustering
- `design/components/` — component-specific design rules
- Do **not** load `archive/reference-products.md` in agentic sessions
