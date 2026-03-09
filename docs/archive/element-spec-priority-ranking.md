# Element Spec Priority Ranking

Last updated: 2026-03-08

This ranking is for implementation order, not spec quality. It is based on:

1. MVP dependency chains from `features.md`
2. Current readiness gaps from `implementation-readiness.md`
3. How many other specs or use cases a spec unblocks
4. Whether the app already has a partial implementation worth finishing before starting net-new UI

`README.md` in `docs/element-specs/` is not ranked because it is an index, not an implementation target.

## Top 10

| Rank | Spec                                                             | Why this should be tackled now                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [map-shell.md](./element-specs/map-shell.md)                     | Highest-leverage spec. The main authenticated experience depends on viewport loading, marker rendering, panel orchestration, and map-first layout all working here.                                            |
| 2    | [photo-marker.md](./element-specs/photo-marker.md)               | The map has limited value without reliable markers, clustering behavior, selection behavior, and correction affordances. This is coupled directly to the biggest map retrieval gaps.                           |
| 3    | [image-detail-view.md](./element-specs/image-detail-view.md)     | Users currently cannot inspect image metadata, correction history, or full image detail. This blocks core retrieval and review workflows.                                                                      |
| 4    | [filter-panel.md](./element-specs/filter-panel.md)               | Filtering is a core MVP capability and currently one of the largest functional gaps. It also anchors project, metadata, time, and distance workflows.                                                          |
| 5    | [active-filter-chips.md](./element-specs/active-filter-chips.md) | Once filters exist, users need visible state and quick removal controls. This closes the loop on filter semantics instead of leaving them opaque.                                                              |
| 6    | [workspace-pane.md](./element-specs/workspace-pane.md)           | The workspace pattern is central to selection review, group creation, and image browsing. Several use cases stay blocked until this is real.                                                                   |
| 7    | [group-tab-bar.md](./element-specs/group-tab-bar.md)             | Active Selection and saved groups depend on tab structure. This is the control surface for the workspace model described in the docs.                                                                          |
| 8    | [radius-selection.md](./element-specs/radius-selection.md)       | Spatial selection is one of the key differentiated map interactions and directly feeds the Active Selection workspace flow.                                                                                    |
| 9    | [search-bar.md](./element-specs/search-bar.md)                   | Search exists in partial form, but the DB-first resolver, better candidate ranking, and committed-state behavior still need to be completed. High value, but not as blocking as map retrieval and detail view. |
| 10   | [thumbnail-grid.md](./element-specs/thumbnail-grid.md)           | Once the workspace exists, users need an efficient gallery surface. This is the first spec that makes groups and selections practically usable.                                                                |

## Full Ranking

| Rank | Spec                                                                 | Priority | Reason                                                                                                                                           |
| ---- | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | [map-shell.md](./element-specs/map-shell.md)                         | Now      | Root container for the authenticated product. Unblocks viewport-bounded loading, marker orchestration, floating controls, and panel composition. |
| 2    | [photo-marker.md](./element-specs/photo-marker.md)                   | Now      | Essential for map retrieval, clustering, hover/selection behavior, and later correction flows.                                                   |
| 3    | [image-detail-view.md](./element-specs/image-detail-view.md)         | Now      | Required for image inspection, metadata review, correction history, and the main retrieval use cases.                                            |
| 4    | [filter-panel.md](./element-specs/filter-panel.md)                   | Now      | Needed for time, project, metadata, and distance filtering. A major gap across retrieval workflows.                                              |
| 5    | [active-filter-chips.md](./element-specs/active-filter-chips.md)     | Now      | Necessary companion to the filter panel so filter state is visible, removable, and understandable.                                               |
| 6    | [workspace-pane.md](./element-specs/workspace-pane.md)               | Now      | Core workspace container for Active Selection, saved groups, and gallery review.                                                                 |
| 7    | [group-tab-bar.md](./element-specs/group-tab-bar.md)                 | Now      | Enables the persistent group model and the Active Selection tab flow described in the product docs.                                              |
| 8    | [radius-selection.md](./element-specs/radius-selection.md)           | Now      | High-value spatial interaction that feeds selection and groups. Important for technician workflows.                                              |
| 9    | [search-bar.md](./element-specs/search-bar.md)                       | Now      | Partial implementation already exists; finishing it is high leverage and lower cost than starting a net-new surface.                             |
| 10   | [thumbnail-grid.md](./element-specs/thumbnail-grid.md)               | Now      | Required to make workspace-pane and groups usable at scale.                                                                                      |
| 11   | [thumbnail-card.md](./element-specs/thumbnail-card.md)               | Now      | Follows immediately after the grid because grid usability depends on card actions, badges, and preview affordances.                              |
| 12   | [map-zone.md](./element-specs/map-zone.md)                           | Next     | Important structural spec for control placement and layering, but secondary to the shell and retrieval behaviors it hosts.                       |
| 13   | [upload-panel.md](./element-specs/upload-panel.md)                   | Next     | Upload exists in partial form. Still important for validation/compliance work, but retrieval and workspace gaps are more blocking right now.     |
| 14   | [upload-button-zone.md](./element-specs/upload-button-zone.md)       | Next     | Small but necessary companion to the upload flow. Lower priority because entry-point behavior already exists in some form.                       |
| 15   | [placement-mode.md](./element-specs/placement-mode.md)               | Next     | Useful for no-GPS uploads, but less urgent than browsing, filtering, and retrieval.                                                              |
| 16   | [gps-button.md](./element-specs/gps-button.md)                       | Next     | Already partially implemented and narrower in scope than the missing retrieval and selection flows.                                              |
| 17   | [sidebar.md](./element-specs/sidebar.md)                             | Next     | Navigation is present enough to move through the app. It should be refined after core map and workspace functionality.                           |
| 18   | [photos-page.md](./element-specs/photos-page.md)                     | Next     | Page-level experience matters, but the map-first MVP has more urgent missing behavior.                                                           |
| 19   | [groups-page.md](./element-specs/groups-page.md)                     | Next     | Important, but the underlying workspace/group primitives should be built before the dedicated page.                                              |
| 20   | [settings-page.md](./element-specs/settings-page.md)                 | Later    | Valuable, but mostly page-level polish compared with missing primary workflows.                                                                  |
| 21   | [theme-toggle.md](./element-specs/theme-toggle.md)                   | Later    | Theming is important, but not more important than core map retrieval, filtering, and workspace flows.                                            |
| 22   | [account-page.md](./element-specs/account-page.md)                   | Later    | Needed for completeness, but current MVP blockers sit elsewhere.                                                                                 |
| 23   | [user-location-marker.md](./element-specs/user-location-marker.md)   | Later    | Narrow spec with limited unblock value relative to the larger map retrieval and selection work.                                                  |
| 24   | [auth-map-background.md](./element-specs/auth-map-background.md)     | Later    | Mostly cosmetic relative to the rest of the product. It should not outrank functional MVP gaps.                                                  |
| 25   | [filter-dropdown.md](./element-specs/filter-dropdown.md)             | Next     | Shared dropdown primitive used by filter-panel for project, metadata, and time range selectors.                                                  |
| 26   | [projects-dropdown.md](./element-specs/projects-dropdown.md)         | Next     | Specialization of filter-dropdown for project selection. Depends on filter-panel being built first.                                              |
| 27   | [sort-dropdown.md](./element-specs/sort-dropdown.md)                 | Next     | Sorting control for workspace-pane grid view. Lower urgency until the grid is functional.                                                        |
| 28   | [grouping-dropdown.md](./element-specs/grouping-dropdown.md)         | Next     | Grouping control for workspace-pane. Follows after sort-dropdown and thumbnail-grid are stable.                                                  |
| 29   | [workspace-toolbar.md](./element-specs/workspace-toolbar.md)         | Next     | Toolbar host for sort/group/view controls. Required once workspace-pane actions expand.                                                          |
| 30   | [workspace-view-system.md](./element-specs/workspace-view-system.md) | Next     | View-switching logic (grid/list/map-only). Builds on workspace-pane and toolbar.                                                                 |
| 31   | [drag-divider.md](./element-specs/drag-divider.md)                   | Next     | Resizable map / workspace split. Important for layout polish but not a functional blocker.                                                       |
| 32   | [custom-properties.md](./element-specs/custom-properties.md)         | Later    | User-defined metadata schema. Powerful but not required for MVP retrieval and grouping flows.                                                    |

## Suggested Delivery Waves

### Wave 1

Build the core retrieval loop:

- [map-shell.md](./element-specs/map-shell.md)
- [photo-marker.md](./element-specs/photo-marker.md)
- [image-detail-view.md](./element-specs/image-detail-view.md)
- [filter-panel.md](./element-specs/filter-panel.md)
- [active-filter-chips.md](./element-specs/active-filter-chips.md)

### Wave 2

Build the workspace and spatial-selection loop:

- [workspace-pane.md](./element-specs/workspace-pane.md)
- [group-tab-bar.md](./element-specs/group-tab-bar.md)
- [radius-selection.md](./element-specs/radius-selection.md)
- [thumbnail-grid.md](./element-specs/thumbnail-grid.md)
- [thumbnail-card.md](./element-specs/thumbnail-card.md)

### Wave 3

Finish partial map and upload affordances:

- [search-bar.md](./element-specs/search-bar.md)
- [map-zone.md](./element-specs/map-zone.md)
- [upload-panel.md](./element-specs/upload-panel.md)
- [upload-button-zone.md](./element-specs/upload-button-zone.md)
- [placement-mode.md](./element-specs/placement-mode.md)
- [gps-button.md](./element-specs/gps-button.md)
- [filter-dropdown.md](./element-specs/filter-dropdown.md)
- [projects-dropdown.md](./element-specs/projects-dropdown.md)
- [drag-divider.md](./element-specs/drag-divider.md)

### Wave 4

Finish secondary pages and polish surfaces:

- [sidebar.md](./element-specs/sidebar.md)
- [photos-page.md](./element-specs/photos-page.md)
- [groups-page.md](./element-specs/groups-page.md)
- [settings-page.md](./element-specs/settings-page.md)
- [theme-toggle.md](./element-specs/theme-toggle.md)
- [account-page.md](./element-specs/account-page.md)
- [sort-dropdown.md](./element-specs/sort-dropdown.md)
- [grouping-dropdown.md](./element-specs/grouping-dropdown.md)
- [workspace-toolbar.md](./element-specs/workspace-toolbar.md)
- [workspace-view-system.md](./element-specs/workspace-view-system.md)
- [custom-properties.md](./element-specs/custom-properties.md)
- [user-location-marker.md](./element-specs/user-location-marker.md)
- [auth-map-background.md](./element-specs/auth-map-background.md)
