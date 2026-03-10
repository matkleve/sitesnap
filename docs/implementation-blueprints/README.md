# Implementation Blueprints

Companion documents that bridge element specs (design contracts) to working code.
Specs say **what** to build. Blueprints say **how** to build it.

## Why These Exist

Element specs are good design contracts but often leave agents guessing at:

- Which service methods to call (and their exact signatures)
- Which Supabase tables/columns/RPCs to query
- How signals and observables flow between components
- What types and interfaces to use (and where they live)
- State machine transitions for complex interactions

Blueprints close that gap with concrete implementation details.

## What's in a Blueprint

| Section                      | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| **Spec Reference**           | Links back to the element spec                                |
| **Service Contract**         | Every service method needed, with full TypeScript signatures  |
| **Data Flow**                | Mermaid diagrams showing how data moves through the system    |
| **Type Definitions**         | Exact interfaces/types with file locations                    |
| **Database Layer**           | Table columns, RPC calls, query patterns                      |
| **Signal/Observable Wiring** | How components communicate via signals, outputs, and services |
| **Missing Infrastructure**   | Services or types that must be created before implementation  |

## How to Use

1. Read the element spec first (design intent)
2. Read the blueprint second (implementation details)
3. Create any missing infrastructure listed in the blueprint
4. Follow the data flow diagrams for wiring
5. Use the exact service method signatures when implementing

## Blueprints (ordered by priority)

| #   | Blueprint                                        | Spec                                                    | Key Services                        |
| --- | ------------------------------------------------ | ------------------------------------------------------- | ----------------------------------- |
| 1   | [map-shell.md](map-shell.md)                     | [element spec](../element-specs/map-shell.md)           | MapAdapter, SupabaseService         |
| 2   | [photo-marker.md](photo-marker.md)               | [element spec](../element-specs/photo-marker.md)        | marker-factory, map-shell-helpers   |
| 3   | [image-detail-view.md](image-detail-view.md)     | [element spec](../element-specs/image-detail-view.md)   | ImageService (new), SupabaseService |
| 4   | [filter-panel.md](filter-panel.md)               | [element spec](../element-specs/filter-panel.md)        | FilterService (new)                 |
| 5   | [active-filter-chips.md](active-filter-chips.md) | [element spec](../element-specs/active-filter-chips.md) | FilterService                       |
| 6   | [workspace-pane.md](workspace-pane.md)           | [element spec](../element-specs/workspace-pane.md)      | SelectionService (new)              |
| 7   | [group-tab-bar.md](group-tab-bar.md)             | [element spec](../element-specs/group-tab-bar.md)       | GroupService (new)                  |
| 8   | [radius-selection.md](radius-selection.md)       | [element spec](../element-specs/radius-selection.md)    | MapAdapter, FilterService           |
| 9   | [search-bar.md](search-bar.md)                   | [element spec](../element-specs/search-bar.md)          | SearchOrchestratorService           |
| 10  | [thumbnail-grid.md](thumbnail-grid.md)           | [element spec](../element-specs/thumbnail-grid.md)      | GroupService, SelectionService      |

## Conventions

- Blueprints reference **real file paths** relative to `apps/web/src/app/`
- Service signatures use exact TypeScript (copy-pasteable)
- Mermaid diagrams are renderable in GitHub and VS Code
- "Missing infrastructure" sections list files that **must be created** before the element can be built
- When a blueprint says "already exists", the file path and method are verified against current code
