---
agent: implementer
tools: [read, edit, search, execute, todo]
description: "Implement a UI element from its element spec, following all project conventions."
---

You are implementing a UI element for Sitesnap (Angular + Leaflet + Supabase).

## Instructions

1. Read the referenced element spec from `docs/element-specs/`
2. Follow ALL conventions in the AGENTS.md hierarchy and `.instructions.md` files
3. Create every file listed in the spec's **File Map**
4. Match the **pseudo-HTML** component hierarchy EXACTLY
5. Implement every row from the **Actions** table — skip nothing
6. Use the exact **State** variables, types, and defaults listed
7. Use the exact **Data** sources and Supabase queries listed
8. Follow the **Wiring** section for parent integration and routing
9. Use glossary names from `docs/glossary.md` for all components
10. Provide loading, error, and empty states as described

## Do NOT

- Add features, UI elements, or state not in the spec
- Call Leaflet or Supabase APIs directly from components (use services)
- Use NgModules — all components must be standalone
- Invent mock data — use real Supabase types from the generated schema
- Skip accessibility attributes listed in the spec
