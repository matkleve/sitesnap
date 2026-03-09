# Per-Element Interaction Scenarios

**What this folder is:** Interaction-level use cases organized per element spec. Each file maps concrete user flows (click → what happens → what state changes) to the element spec's Actions table and the product-level use cases in [use-cases.md](../use-cases.md).

**Why it exists:** The existing doc layers are:

| Layer                     | Scope                                          | Location                            |
| ------------------------- | ---------------------------------------------- | ----------------------------------- |
| Product use cases         | End-to-end user stories                        | `docs/use-cases.md`                 |
| Element specs             | Component contract (Actions, State, Hierarchy) | `docs/element-specs/`               |
| Implementation blueprints | Code-level details (service sigs, queries)     | `docs/implementation-blueprints/`   |
| **Interaction scenarios** | **Click-by-click flows per element**           | **`docs/use-cases/` (this folder)** |

Interaction scenarios bridge the gap: they are specific enough to drive implementation and test cases, but written in terms of user intent rather than code.

**Do we need more layers?** No. These four layers cover the full stack from "what the user wants" to "what the code does":

```
Product Use Cases (UC1–UC13)      ← Why the user is here
    ↓
Interaction Scenarios (this)      ← What they click, in what order, what happens
    ↓
Element Specs                     ← Component contracts (Actions, State, Hierarchy)
    ↓
Implementation Blueprints         ← Service signatures, queries, type defs
```

## File naming

`{element-spec-name}.md` — matches the filename in `docs/element-specs/`.

## Cross-linking rules

Each interaction scenario file must link to:

- The element spec it covers
- The implementation blueprint (if one exists)
- The product use cases it satisfies
- Related element specs that participate in the flow

## Index

| File                         | Element Spec                               | Blueprint                                              | Status |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------ | ------ |
| [map-shell.md](map-shell.md) | [map-shell](../element-specs/map-shell.md) | [map-shell](../implementation-blueprints/map-shell.md) | Active |

## Files needed (priority order)

Interaction scenario files should be created for these specs as they are implemented. Ordered by delivery wave from `element-spec-priority-ranking.md`.

- [ ] photo-marker.md — Wave 1
- [ ] image-detail-view.md — Wave 1
- [ ] filter-panel.md — Wave 1
- [ ] workspace-pane.md — Wave 2
- [ ] radius-selection.md — Wave 2
- [ ] search-bar.md — Wave 3
- [ ] upload-panel.md — Wave 3
