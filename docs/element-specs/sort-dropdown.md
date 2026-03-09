# Sort Dropdown

## What It Is

A dropdown for choosing the sort order of images in the workspace pane. Contains a search input at the top to filter the sort options, and a list of sort criteria below. Each sort option can be ascending or descending. Only one sort is active at a time (not multi-sort).

## What It Looks Like

Floating dropdown anchored below the "Sort" toolbar button. Width: 15rem (240px). `--color-bg-elevated` background, `shadow-xl`, `rounded-lg` corners. Top: a compact search input (`--text-small`, `--color-border-strong` bottom border, no box outline — Notion-style inline search). Below: a list of sort options as `.ui-item` rows. Active sort option has `--color-primary` text and a checkmark icon. Each row shows a direction toggle (↑/↓) on hover.

## Where It Lives

- **Parent**: `WorkspaceToolbarComponent`
- **Appears when**: User clicks the "Sort" toolbar button

## Actions

| #   | User Action                   | System Response                                           | Triggers             |
| --- | ----------------------------- | --------------------------------------------------------- | -------------------- |
| 1   | Types in search input         | Filters visible sort options                              | `searchTerm` changes |
| 2   | Clicks a sort option          | Sets that property as the active sort; workspace re-sorts | `activeSort` set     |
| 3   | Clicks direction toggle (↑/↓) | Flips sort direction for the active sort                  | `sortDirection` flip |
| 4   | Clicks outside or Escape      | Closes dropdown                                           | Dropdown closes      |
| 5   | Clears search                 | Shows all options again                                   | `searchTerm` cleared |

## Component Hierarchy

```
SortDropdown                               ← floating dropdown, --color-bg-elevated, shadow-xl, rounded-lg
├── SearchInput                            ← compact, placeholder "Search properties…", --text-small
├── OptionsList                            ← scrollable if many options
│   └── SortOptionRow × N                  ← .ui-item
│       ├── PropertyIcon                   ← Material Icon matching property type
│       ├── PropertyLabel                  ← property name
│       ├── [active] Checkmark (✓)         ← --color-primary
│       └── [hover] DirectionToggle (↑↓)   ← flip button
└── [no results] EmptyHint                 ← "No matching properties"
```

### Sort Options (built-in + custom)

| Property      | Default Direction | Icon            |
| ------------- | ----------------- | --------------- |
| Date captured | Descending (↓)    | `schedule`      |
| Date uploaded | Descending (↓)    | `cloud_upload`  |
| Name          | Ascending (↑)     | `sort_by_alpha` |
| Distance      | Ascending (↑)     | `straighten`    |
| Address       | Ascending (↑)     | `location_on`   |
| City          | Ascending (↑)     | `location_city` |
| Country       | Ascending (↑)     | `flag`          |
| Project       | Ascending (↑)     | `folder`        |
| _Custom keys_ | Ascending (↑)     | `label`         |

## Data

| Field               | Source                                                               | Type            |
| ------------------- | -------------------------------------------------------------------- | --------------- |
| Built-in properties | Hardcoded list                                                       | `SortOption[]`  |
| Custom properties   | `supabase.from('metadata_keys').select('id, key_name')` (org-scoped) | `MetadataKey[]` |

## State

| Name         | Type                                          | Default                                       | Controls                     |
| ------------ | --------------------------------------------- | --------------------------------------------- | ---------------------------- |
| `searchTerm` | `string`                                      | `''`                                          | Filters visible sort options |
| `activeSort` | `{ key: string; direction: 'asc' \| 'desc' }` | `{ key: 'date_captured', direction: 'desc' }` | Current sort                 |

## File Map

| File                                                       | Purpose                   |
| ---------------------------------------------------------- | ------------------------- |
| `features/map/workspace-pane/sort-dropdown.component.ts`   | Sort dropdown with search |
| `features/map/workspace-pane/sort-dropdown.component.html` | Template                  |
| `features/map/workspace-pane/sort-dropdown.component.scss` | Styles                    |

## Wiring

- Rendered inside `WorkspaceToolbarComponent` via `@if (activeDropdown() === 'sort')`
- Emits `sortChanged` to `WorkspaceViewService`
- `WorkspaceViewService` re-sorts the image list and emits to content area

## Acceptance Criteria

- [x] Search input at top, filters options by name
- [x] All built-in sort options listed
- [ ] Custom metadata keys appear as additional sort options
- [x] Active sort highlighted with checkmark and `--color-primary` text
- [ ] Direction toggle (↑/↓) visible on hover for each option
- [ ] Click applies sort immediately — workspace re-sorts live
- [x] Single active sort (not multi-sort)
- [ ] Empty state "No matching properties" when search has no results
- [x] Dropdown uses `position: fixed` to escape overflow
- [x] Row hover: clay 8% background tint

---

## Sort Flow

```mermaid
sequenceDiagram
    participant U as User
    participant TB as Toolbar "Sort" Button
    participant SD as SortDropdown
    participant WVS as WorkspaceViewService
    participant WP as Workspace Content

    U->>TB: click
    TB->>SD: open dropdown
    U->>SD: type "dat" in search
    SD->>SD: filter options → [Date captured, Date uploaded]
    U->>SD: click "Date captured"
    SD->>SD: set activeSort = {key: 'date_captured', dir: 'desc'}
    SD->>WVS: sortChanged({key: 'date_captured', dir: 'desc'})
    WVS->>WVS: sort images by captured_at DESC
    WVS->>WP: emit sorted images
    WP->>WP: re-render thumbnail grid in new order

    U->>SD: click ↑ toggle on "Date captured"
    SD->>SD: flip direction → 'asc'
    SD->>WVS: sortChanged({key: 'date_captured', dir: 'asc'})
    WVS->>WP: emit re-sorted images
```

## Sort + Grouping Interaction

```mermaid
flowchart TD
    Images["Image List (unsorted)"]
    Sort["Sort: Date captured ↓"]
    Group["Group by: City"]

    Images -->|"1. sort first"| Sort
    Sort -->|"2. then group"| Group
    Group --> Output

    subgraph Output["Workspace Content"]
        H1["── Wien ──"]
        I1["2026-03-05 | 2026-02-20 | 2026-01-15"]
        H2["── Zürich ──"]
        I2["2026-03-07 | 2026-03-01 | 2025-12-10"]
        H1 --> I1
        H2 --> I2
    end

    Note["Sort applies within each group.\nGroups themselves are ordered by\ntheir first item's sort value."]
```

## Sort Dropdown — State Machine

```mermaid
stateDiagram-v2
    [*] --> DefaultSort

    state DefaultSort {
        [*]: activeSort = date_captured DESC\nToolbar dot hidden (default = no custom sort)\nSearch empty
    }

    state CustomSort {
        [*]: User selected a non-default sort\nToolbar dot visible (clay)\nActive option has checkmark
    }

    state Searching {
        [*]: searchTerm is non-empty\nOptions filtered by name match\nMatching options shown
    }

    state EmptySearch {
        [*]: searchTerm matches nothing\n"No matching properties" shown
    }

    DefaultSort --> CustomSort: click different option
    CustomSort --> CustomSort: click different option
    CustomSort --> DefaultSort: click date_captured DESC
    DefaultSort --> Searching: type in search input
    CustomSort --> Searching: type in search input
    Searching --> EmptySearch: no options match
    EmptySearch --> Searching: edit search (matches found)
    Searching --> DefaultSort: clear search + sort is default
    Searching --> CustomSort: clear search + sort is custom
```

## Sort Option Row States

```mermaid
stateDiagram-v2
    state "Inactive Row" as Inactive {
        [*]: text-primary\nno checkmark\ndirection toggle hidden
    }
    state "Inactive Hover" as InactiveHover {
        [*]: bg clay 8%\ndirection toggle visible (↑/↓)\ncursor pointer
    }
    state "Active Row" as Active {
        [*]: text --color-primary\ncheckmark visible\ndirection shown
    }
    state "Active Hover" as ActiveHover {
        [*]: bg clay 8%\ndirection toggle highlighted\nclick = flip direction
    }

    Inactive --> InactiveHover: mouseenter
    InactiveHover --> Inactive: mouseleave
    InactiveHover --> Active: click (select this sort)
    Active --> ActiveHover: mouseenter
    ActiveHover --> Active: mouseleave
    ActiveHover --> Active: click direction toggle (flips asc/desc)
    Active --> Inactive: different option clicked
```

## Direction Toggle

```mermaid
stateDiagram-v2
    [*] --> Descending
    Descending --> Ascending: click toggle
    Ascending --> Descending: click toggle

    state Descending {
        [*]: arrow_downward icon\nNewest/largest first
    }
    state Ascending {
        [*]: arrow_upward icon\nOldest/smallest first
    }
```
