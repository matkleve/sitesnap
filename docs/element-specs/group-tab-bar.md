# Group Tab Bar

> **Blueprint:** [implementation-blueprints/group-tab-bar.md](../implementation-blueprints/group-tab-bar.md)

## What It Is

A horizontal row of tabs inside the Workspace Pane. Each tab represents a group of images. The first tab is always Active Selection (ephemeral, current map selections). Remaining tabs are user-created named groups. A "+" button at the end creates new groups.

## What It Looks Like

Scrollable horizontal row, compact tab height (28px). Tabs are pills: `--color-bg-elevated` background, text label, active tab gets `--color-clay` bottom border or background tint. Active Selection tab is pinned leftmost and cannot be closed/renamed. Named Group tabs have a context menu on long-press. Overflow scrolls horizontally.

## Where It Lives

- **Parent**: Workspace Pane
- **Always visible** when Workspace Pane is open

## Actions

| #   | User Action              | System Response                                   | Triggers              |
| --- | ------------------------ | ------------------------------------------------- | --------------------- |
| 1   | Clicks a tab             | Content area switches to that group's thumbnails  | `activeTabId` changes |
| 2   | Clicks "+" button        | Creates a new empty named group, prompts for name | New tab appears       |
| 3   | Long-presses a named tab | Opens context menu: Rename, Delete                | Context menu          |
| 4   | Selects "Rename"         | Tab label becomes editable inline input           | Focus on input        |
| 5   | Selects "Delete"         | Confirmation prompt, then removes group           | Tab removed           |
| 6   | Scrolls horizontally     | Reveals overflow tabs                             | Native scroll         |

## Component Hierarchy

```
GroupTabBar                                ← scrollable horizontal row, h-8, overflow-x-auto
├── ActiveSelectionTab                     ← pinned first, "(N) Selection", cannot close/rename
├── NamedGroupTab × N                      ← group name, closable, context menu on long-press
│   └── [editing] InlineNameInput          ← replaces label text during rename
└── NewGroupButton (+)                     ← compact button at end of row
```

## Data

| Field            | Source                                        | Type           |
| ---------------- | --------------------------------------------- | -------------- |
| Saved groups     | `supabase.from('saved_groups').select(...)`   | `SavedGroup[]` |
| Selection images | In-memory (Active Selection is not persisted) | `Image[]`      |

## State

| Name           | Type             | Default       | Controls                       |
| -------------- | ---------------- | ------------- | ------------------------------ |
| `activeTabId`  | `string`         | `'selection'` | Which tab content is displayed |
| `editingTabId` | `string \| null` | `null`        | Which tab is in rename mode    |

## File Map

| File                                                     | Purpose           |
| -------------------------------------------------------- | ----------------- |
| `features/map/workspace-pane/group-tab-bar.component.ts` | Tab bar component |

## Wiring

- Import `GroupTabBarComponent` in `WorkspacePaneComponent`
- Inject `GroupService` for CRUD operations
- Bind `activeTabId` input from `WorkspacePaneComponent` state

## Acceptance Criteria

- [ ] Active Selection tab always first, cannot be closed or renamed
- [ ] Named group tabs show group name, support rename and delete
- [ ] "+" button creates new group with name prompt
- [ ] Horizontal scroll when tabs overflow
- [ ] Active tab visually distinct (`--color-clay` accent)
- [ ] Long-press context menu works on named tabs
- [ ] Tab switches update the content area below
