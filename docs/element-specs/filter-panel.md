# Filter Panel

## What It Is

A grouped accordion panel for narrowing which images appear on the map and in the workspace. Filters by time range, project, metadata key/value, and max distance from a reference point. Desktop: slides in from top-right. Mobile: bottom modal.

## What It Looks Like

Accordion-style panel with collapsible filter groups. Use the shared `.ui-container` panel shell so radius, padding, and gap align with the Sidebar and Search Bar. `--color-bg-surface` background, `--color-border` dividers between groups. Each group has a header (click to expand/collapse) and controls inside. A summary at the bottom shows count of active filters and a "Clear all" action.

## Where It Lives

- **Parent**: Map Zone floating element
- **Appears when**: User clicks a filter trigger button (icon near search bar)

## Actions

| #   | User Action                        | System Response                                      | Triggers             |
| --- | ---------------------------------- | ---------------------------------------------------- | -------------------- |
| 1   | Opens filter panel                 | Panel slides in, all groups collapsed by default     | Panel visible        |
| 2   | Clicks a group header              | Toggles that group open/closed                       | Accordion state      |
| 3   | Sets a time range                  | Applies date-from and date-to filter                 | Map markers re-query |
| 4   | Selects a project                  | Filters to images in that project only               | Map markers re-query |
| 5   | Adds a metadata filter (key=value) | Filters to images matching that metadata             | Map markers re-query |
| 6   | Sets max distance                  | Filters to images within N meters of reference point | Map markers re-query |
| 7   | Clicks "Clear all"                 | Removes all active filters                           | All filters reset    |
| 8   | Closes panel                       | Panel slides out, filters remain active              | Panel hidden         |

## Component Hierarchy

```
FilterPanel                                ← `.ui-container` sliding panel, --color-bg-surface
├── PanelHeader                            ← "Filters" title + close button
├── FilterGroup "Time Range"               ← accordion section
│   ├── GroupHeader                        ← click to expand/collapse, chevron indicator
│   └── [expanded] DateRangeControls       ← from-date + to-date inputs
├── FilterGroup "Project"
│   └── [expanded] ProjectSelect           ← dropdown or searchable list of projects
├── FilterGroup "Metadata"
│   └── [expanded] MetadataFilter          ← key dropdown + value input, add multiple
├── FilterGroup "Max Distance"
│   └── [expanded] DistanceSlider          ← slider or number input, in meters
└── PanelFooter
    ├── ActiveFilterCount                  ← "N filters active"
    └── ClearAllButton                     ← ghost button "Clear all"
```

## Data

| Field                    | Source                                              | Type            |
| ------------------------ | --------------------------------------------------- | --------------- |
| Projects list            | `supabase.from('projects').select('id, name')`      | `Project[]`     |
| Metadata keys            | `supabase.from('metadata_keys').select('id, name')` | `MetadataKey[]` |
| Distance reference point | From search commit or GPS fix                       | `{ lat, lng }`  |

## State

| Name             | Type            | Default   | Controls                          |
| ---------------- | --------------- | --------- | --------------------------------- |
| `isOpen`         | `boolean`       | `false`   | Panel visibility                  |
| `expandedGroups` | `Set<string>`   | empty     | Which accordion groups are open   |
| `filters`        | `ActiveFilters` | all empty | Current filter values             |
| `activeCount`    | `number`        | `0`       | Derived: how many filters are set |

## File Map

| File                                                    | Purpose                                 |
| ------------------------------------------------------- | --------------------------------------- |
| `features/map/filter-panel/filter-panel.component.ts`   | Main panel component                    |
| `features/map/filter-panel/filter-panel.component.html` | Template                                |
| `features/map/filter-panel/filter-panel.component.scss` | Styles                                  |
| `core/filter.service.ts`                                | Filter state management, query building |

## Wiring

- Floating element in Map Zone, positioned top-right (below upload button area)
- `FilterService` holds the active filters and emits changes
- Map viewport query incorporates active filters
- Active Filter Chips Strip reads from same `FilterService`

## Acceptance Criteria

- [ ] Desktop: slides in from top-right
- [ ] Mobile: bottom modal
- [ ] Uses `.ui-container` as the shared panel shell
- [ ] Accordion groups expand/collapse independently
- [ ] Applying a filter immediately updates map markers
- [ ] "Clear all" removes all filters
- [ ] Closing panel does NOT clear filters
- [ ] Active filter count shown in footer
- [ ] Distance filter requires a reference point (from search or GPS)
