# Grouping Dropdown

## What It Is

A dropdown that lets the user choose which image property to group by. Groups organize the workspace pane content into sections with headings. Properties are drag-reorderable to control multi-level grouping priority. The dropdown has two sections: active (dark text, currently grouping) and available (lighter text, inactive). Inspired by Notion's "Group" database view control.

## What It Looks Like

A floating dropdown anchored below the "Grouping" toolbar button. Width: 15rem (240px). `--color-bg-elevated` background, `shadow-xl`, `rounded-lg` corners. Two sections separated by a `--color-border` line:

- **Upper section (Active)**: properties currently used for grouping. Text in `--color-text-primary`. Header row: **"Grouped by" label (left) + "Empty" button (right)**. The "Empty" button is a small text button (`.dd-clear-btn`) that clears all active groupings, moving every property back to Available. Only visible when there is at least one active grouping. Each property row layout: **Media icon → Label → Drag handle (≡)**. Drag handle visible on hover only (Quiet Actions pattern). Rows are drag-reorderable within the section. **Click** an active row to deactivate it (moves to Available); rows can also be **dragged** downward past the divider into Available to deactivate.
- **Lower section (Available)**: properties not currently grouping. Text in `--color-text-secondary`. Click to activate (moves to upper section). Rows can also be dragged upward past the divider into Active to activate.

Each row is a `.ui-item` with a leading media area, a label, and a trailing drag handle (≡, `drag_indicator` Material Icon) on the right. There is **no × remove button** — deactivation is done by **clicking an active row** (moves it back to Available) or by **dragging it down past the divider** into the Available section.

**Multi-select**: Ctrl+Click selects multiple rows (applied `selected` visual). Dragging any selected row moves the entire selection as a group. Clicking without Ctrl clears the selection.

## Where It Lives

- **Parent**: `WorkspaceToolbarComponent`
- **Appears when**: User clicks the "Grouping" toolbar button
- **Positioned**: Below the button, left-aligned

## Actions

| #   | User Action                                            | System Response                                                                                    | Triggers                      |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Clicks an available (inactive) property                | Moves property from Available to Active section (activates grouping); workspace regroups           | `activeGroupings` updated     |
| 2   | Clicks an active property                              | Moves property from Active to Available section (deactivates grouping); workspace regroups         | `activeGroupings` updated     |
| 3   | Drags an active row down past the divider              | Moves property from Active to Available (deactivates grouping); workspace regroups                 | `activeGroupings` updated     |
| 4   | Drags an available row up past the divider             | Moves property from Available to Active (activates grouping); workspace regroups                   | `activeGroupings` updated     |
| 5   | Drags an active property up/down within Active section | Reorders grouping priority; workspace regroups live                                                | `activeGroupings` reorder     |
| 6   | Ctrl+Click on a row                                    | Toggles selection on the row (adds/removes from multi-select). Does not activate/deactivate.       | `selectedRows` updated        |
| 7   | Drags any selected row (with multi-select active)      | Moves the entire selection group to the drop target section/position                               | `activeGroupings` bulk update |
| 8   | Clicks a row without Ctrl                              | Clears multi-selection; performs single-click action (activate if available, deactivate if active) | `selectedRows` cleared        |
| 9   | Clicks outside or Escape                               | Closes dropdown, clears selection                                                                  | Dropdown closes               |
| 10  | Hovers a row                                           | Reveals drag handle (≡) on the right side                                                          | Opacity 0→1, 80ms             |
| 11  | Clicks "Empty" button next to "Grouped by" header      | Moves all active groupings back to Available; workspace ungroups                                   | `activeGroupings` cleared     |

## Component Hierarchy

```
GroupingDropdown                           ← floating dropdown, --color-bg-elevated, shadow-xl, rounded-lg
├── UnifiedDragContext (cdkDropListGroup)   ← single CDK drag context spanning both sections
│   ├── ActiveSection (cdkDropList)         ← upper drop zone
│   │   ├── SectionHeader                  ← flex row: label left, button right
│   │   │   ├── SectionLabel "Grouped by"   ← --text-caption, --color-text-secondary
│   │   │   └── EmptyButton "Empty"        ← text button, visible only when activeGroupings.length > 0
│   │   └── GroupingRow × N                ← .ui-item, cdkDrag
│   │       ├── MediaIcon                  ← leading property icon (e.g. calendar, location)
│   │       ├── PropertyLabel              ← property name, --color-text-primary
│   │       └── [hover] DragHandle (≡)     ← trailing icon, visible on hover, cdkDragHandle
│   ├── Divider                            ← 1px --color-border (visual only, not a drag boundary)
│   └── AvailableSection (cdkDropList)     ← lower drop zone
│       ├── SectionLabel "Available"       ← --text-caption, --color-text-secondary
│       └── GroupingRow × N                ← .ui-item, cdkDrag, click to activate
│           ├── MediaIcon                  ← leading property icon
│           ├── PropertyLabel              ← property name, --color-text-secondary
│           └── [hover] DragHandle (≡)     ← trailing icon, visible on hover, cdkDragHandle
```

## Data

| Field               | Source                                                                                     | Type            |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| Built-in properties | Hardcoded list: Date, Year, Month, Project, City, District, Street, Country, Address, User | `PropertyDef[]` |
| Custom properties   | `supabase.from('metadata_keys').select('id, key_name').eq('organization_id', orgId)`       | `MetadataKey[]` |

### Built-in Grouping Property Data Sources

| Property | Image Field    | Derivation                                 | Fallback             |
| -------- | -------------- | ------------------------------------------ | -------------------- |
| Date     | `capturedAt`   | `toLocaleDateString(full)` on client       | `"Unknown date"`     |
| Year     | `capturedAt`   | `getFullYear()` on client                  | `"Unknown year"`     |
| Month    | `capturedAt`   | `toLocaleDateString(year+month)` on client | `"Unknown month"`    |
| Project  | `projectName`  | JOIN via `cluster_images` RPC              | `"No project"`       |
| City     | `city`         | Structured column from reverse geocoding   | `"Unknown city"`     |
| District | `district`     | Structured column from reverse geocoding   | `"Unknown district"` |
| Street   | `street`       | Structured column from reverse geocoding   | `"Unknown street"`   |
| Country  | `country`      | Structured column from reverse geocoding   | `"Unknown country"`  |
| Address  | `addressLabel` | Full human-readable address                | `"Unknown address"`  |
| User     | `userName`     | JOIN profiles via `cluster_images` RPC     | `"Unknown user"`     |

See also: [photo-grouping-data use case](../use-cases/photo-grouping-data.md) for full derivation flow.

## State

| Name              | Type            | Default | Controls                                                   |
| ----------------- | --------------- | ------- | ---------------------------------------------------------- |
| `activeGroupings` | `PropertyRef[]` | `[]`    | Ordered list of properties used for grouping               |
| `availableProps`  | `PropertyDef[]` | all     | Properties not in activeGroupings                          |
| `selectedRows`    | `Set<string>`   | empty   | Row keys currently multi-selected via Ctrl+Click           |
| `isDragging`      | `boolean`       | `false` | True while any row is being dragged (cdkDragStarted/Ended) |

Where `PropertyRef` = `{ type: 'builtin' | 'custom'; key: string; id?: string }`.

## File Map

| File                                                                             | Purpose                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| `features/map/workspace-pane/workspace-toolbar/grouping-dropdown.component.ts`   | Dropdown with drag-reorder (inline template) |
| `features/map/workspace-pane/workspace-toolbar/grouping-dropdown.component.scss` | Styles                                       |

## Wiring

- Rendered inside `WorkspaceToolbarComponent` via `@if (activeDropdown() === 'grouping')`
- Emits `groupingsChanged` with ordered `PropertyRef[]` to `WorkspaceViewService`
- `WorkspaceViewService` re-groups the image list and emits grouped sections to the content area

## Acceptance Criteria

- [x] Two sections: active (dark text) and available (light text)
- [x] Divider line between sections (visual only — drag crosses it freely)
- [x] Click on available property activates it (moves to upper section)
- [x] Click on active property deactivates it (moves to lower section)
- [x] No × button — deactivation is done by clicking an active row or dragging it past the divider into Available
- [x] Drag handle on the **right** (trailing) side of each row, visible on hover only (Quiet Actions)
- [x] Row layout: Media icon → Label → Drag handle (≡)
- [x] Single CDK DragDrop context spanning both sections (cross-section dragging)
- [x] Dragging from Active ↓ past divider → deactivates property
- [x] Dragging from Available ↑ past divider → activates property
- [x] Drag reorder within Active updates grouping priority live
- [x] Ctrl+Click multi-selects rows; dragging any selected row moves the entire selection
- [x] Click without Ctrl clears multi-selection
- [x] Workspace pane content regrouped on every change (emits `groupingsChanged`)
- [x] Built-in properties: Address, City, Country, Date, Project, User
- [ ] Custom metadata keys appear in available list
- [x] Dropdown uses `position: fixed` to escape overflow
- [x] Row hover: clay 8% background tint
- [x] Active row: text-primary, inactive row: text-secondary
- [x] Selected row: clay 14% background, 2px left border
- [x] CDK drag preview: elevated shadow, opacity 0.9
- [x] CDK drag placeholder: dashed border, 40% opacity
- [ ] "Empty" button on the right of the "Grouped by" header — clears all active groupings
- [ ] Empty drop target: idle → "No grouping applied" (disabled text, no border)
- [ ] Empty drop target: drag active → "Drop here to group" (dashed border, clay 4% bg)
- [ ] Empty drop target: receiving → stronger highlight (clay 10% bg, clay dashed outline)
- [ ] `isDragging` signal tracks drag lifecycle (cdkDragStarted/cdkDragEnded)

---

## Grouping Flow

```mermaid
flowchart TD
    User["User clicks 'Grouping' button"]
    Open["GroupingDropdown opens"]
    User --> Open

    subgraph Dropdown["Unified CDK Drag Context"]
        direction TB
        Active["Active Section\n(dark text, drag-reorderable)"]
        Divider["── divider ──"]
        Available["Available Section\n(light text)"]
        Active --- Divider --- Available
    end

    Open --> Dropdown

    ClickActivate["User clicks available property"]
    Available -->|click| ClickActivate
    ClickActivate -->|"property moves up"| Active

    ClickDeactivate["User clicks active property"]
    Active -->|click| ClickDeactivate
    ClickDeactivate -->|"property moves down"| Available

    DragActivate["User drags available row up past divider"]
    Available -->|"drag ≡ ↑"| DragActivate
    DragActivate -->|"property moves up"| Active

    DragDeactivate["User drags active row down past divider"]
    Active -->|"drag ≡ ↓"| DragDeactivate
    DragDeactivate -->|"property moves down"| Available

    Reorder["User drags active property within Active"]
    Active -->|"drag ≡"| Reorder
    Reorder -->|"new order"| Active

    MultiDrag["User Ctrl+Clicks multiple rows,\nthen drags selection"]
    Active -->|"Ctrl+Click + drag"| MultiDrag
    Available -->|"Ctrl+Click + drag"| MultiDrag
    MultiDrag -->|"group move"| Active
    MultiDrag -->|"group move"| Available

    ClickActivate --> Emit["Emit groupingsChanged"]
    ClickDeactivate --> Emit
    DragActivate --> Emit
    DragDeactivate --> Emit
    Reorder --> Emit
    MultiDrag --> Emit

    Emit --> WVS["WorkspaceViewService\nre-groups images"]
    WVS --> Content["Workspace Content\nre-renders with group headings"]
```

## Grouping Rendering in Workspace

```mermaid
flowchart LR
    subgraph Input["Flat Image List"]
        I1["img: Zürich, Beton"]
        I2["img: Zürich, Holz"]
        I3["img: Wien, Beton"]
        I4["img: Wien, Holz"]
    end

    subgraph Grouped["Grouped by City"]
        direction TB
        H1["── Zürich (2) ──"]
        T1["🖼 Beton | 🖼 Holz"]
        H2["── Wien (2) ──"]
        T2["🖼 Beton | 🖼 Holz"]
        H1 --> T1
        H2 --> T2
    end

    Input -->|"groupBy: City"| Grouped
```

## Multi-Level Grouping

```mermaid
flowchart LR
    subgraph Input["Flat Image List"]
        I1["img: Zürich, Beton, ProjectA"]
        I2["img: Zürich, Holz, ProjectA"]
        I3["img: Wien, Beton, ProjectB"]
    end

    subgraph Nested["Grouped by City → Material"]
        direction TB
        C1["── Zürich ──"]
        M1["    ── Beton (1) ──"]
        M2["    ── Holz (1) ──"]
        C2["── Wien ──"]
        M3["    ── Beton (1) ──"]
        C1 --> M1
        C1 --> M2
        C2 --> M3
    end

    Input -->|"groupBy: [City, Material]"| Nested
```

## Empty Drop Target Pattern

When the Active section has no groupings, the drop zone must give clear visual feedback across the full drag lifecycle. A local signal `isDragging` tracks whether any row in the dropdown is being dragged.

### Empty Drop Zone States

| State                        | Condition                                          | Visual                                                                                                                       |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Idle**                     | `activeGroupings.length === 0` and `!isDragging()` | "No grouping applied" in `--color-text-disabled`, no border                                                                  |
| **Drag active (invitation)** | `activeGroupings.length === 0` and `isDragging()`  | Dashed `--color-border` outline, text changes to "Drop here to group", `--color-text-secondary`, subtle `clay 4%` background |
| **Receiving (hover)**        | CDK adds `.cdk-drop-list-receiving`                | Strong `clay 10%` background, dashed `--color-clay` outline, text in `--color-text-primary`                                  |

### Implementation

- `isDragging = signal(false)` — set `true` on any `cdkDragStarted`, set `false` on any `cdkDragEnded`
- The `.dd-empty` placeholder and the `cdkDropList` drop zone are the **same element** — `.dd-drop-zone--empty` carries both roles
- Class binding: `[class.dd-drop-zone--dragging]="isDragging()"` on the drop zone
- CDK automatically adds `.cdk-drop-list-receiving` when a dragged item enters the zone — styles layer on top
- The `.dd-empty` text content switches via `@if (isDragging())` between "Drop here to group" and "No grouping applied"

### State flow

```
┌─────────────────────────────────┐
│  Idle                           │
│  "No grouping applied"          │
│  text-disabled, no border       │
├─────────────────────────────────┤
│         cdkDragStarted ↓        │
├─────────────────────────────────┤
│  Drag Active (invitation)       │
│  "Drop here to group"           │
│  text-secondary, border dashed  │
│  clay 4% bg                     │
├─────────────────────────────────┤
│     cursor enters zone ↓        │
├─────────────────────────────────┤
│  Receiving (hover)              │
│  "Drop here to group"           │
│  text-primary, clay outline     │
│  clay 10% bg                    │
└─────────────────────────────────┘
      ↓ cdkDragEnded → back to Idle
```

## Cross-Section Drag Interaction (CDK DragDrop)

Both sections share a `cdkDropListGroup`. Each section is a `cdkDropList` connected to the other via `[cdkDropListConnectedTo]`. Dragging an item across the divider transfers it between lists.

### Single-Item Drag

```mermaid
sequenceDiagram
    participant U as User
    participant DD as GroupingDropdown
    participant CDK as @angular/cdk DragDrop
    participant WVS as WorkspaceViewService
    participant WP as WorkspacePane Content

    U->>DD: mousedown on drag handle (≡, right side)
    DD->>CDK: cdkDragStarted
    U->>DD: drag row across divider (Active → Available)
    DD->>CDK: cdkDragMoved (preview crosses divider)
    U->>DD: mouseup (drop into Available section)
    CDK->>DD: cdkDropListDropped(event)
    DD->>DD: transferArrayItem(active → available)
    DD->>WVS: groupingsChanged([City, Material] → [City])
    WVS->>WVS: re-group image list
    WVS->>WP: emit grouped sections
    WP->>WP: re-render headings + thumbnail grid
```

### Multi-Select Drag

```mermaid
sequenceDiagram
    participant U as User
    participant DD as GroupingDropdown
    participant CDK as @angular/cdk DragDrop
    participant WVS as WorkspaceViewService

    U->>DD: Ctrl+Click "City" row (selects)
    DD->>DD: selectedRows.add('city')
    U->>DD: Ctrl+Click "Country" row (selects)
    DD->>DD: selectedRows.add('country')
    Note over DD: 2 rows highlighted with selected state

    U->>DD: mousedown on drag handle of any selected row
    DD->>CDK: cdkDragStarted (custom preview shows 2 items)
    U->>DD: drag selection across divider
    U->>DD: mouseup (drop)
    CDK->>DD: cdkDropListDropped(event)
    DD->>DD: transferArrayItem for each selected row
    DD->>DD: selectedRows.clear()
    DD->>WVS: groupingsChanged(updated list)
    WVS->>WVS: re-group image list
```

## Grouping Dropdown — State Machine

```mermaid
stateDiagram-v2
    [*] --> Empty

    state Empty {
        [*]: No active groupings\nAll properties in Available section\nToolbar dot hidden
    }

    state SingleGrouping {
        [*]: One property in Active section\nRemaining in Available\nToolbar dot visible (clay)
    }

    state MultiGrouping {
        [*]: 2+ properties in Active section\nDrag handles visible on hover\nToolbar dot visible (clay)
    }

    state DragWithinActive {
        [*]: User dragging within Active section\nDrop preview shows new position\nReorders grouping priority
    }

    state DragCrossSection {
        [*]: User dragging across divider\nPreview crosses boundary\nActivates or deactivates property
    }

    state MultiSelected {
        [*]: 2+ rows have selected state (Ctrl+Click)\nDrag moves entire selection
    }

    Empty --> SingleGrouping: click available property
    Empty --> SingleGrouping: drag available row ↑ past divider
    SingleGrouping --> MultiGrouping: click / drag another property up
    MultiGrouping --> MultiGrouping: click / drag another property up
    MultiGrouping --> DragWithinActive: drag handle within Active
    DragWithinActive --> MultiGrouping: drop (reorder applied)
    SingleGrouping --> DragCrossSection: drag active row ↓ past divider
    MultiGrouping --> DragCrossSection: drag active row ↓ past divider
    DragCrossSection --> Empty: drop in Available (was last active)
    DragCrossSection --> SingleGrouping: drop in Available (leaves 1)
    DragCrossSection --> MultiGrouping: drop in Available (leaves 2+)
    DragCrossSection --> SingleGrouping: drop in Active (was available, now 1)
    DragCrossSection --> MultiGrouping: drop in Active (was available, now 2+)

    Empty --> MultiSelected: Ctrl+Click rows
    SingleGrouping --> MultiSelected: Ctrl+Click rows
    MultiGrouping --> MultiSelected: Ctrl+Click rows
    MultiSelected --> DragCrossSection: drag selected group
    MultiSelected --> Empty: click without Ctrl (clears)
    MultiSelected --> SingleGrouping: click without Ctrl (clears)
    MultiSelected --> MultiGrouping: click without Ctrl (clears)
```

## Grouping Row States

```mermaid
stateDiagram-v2
    state "Available Row — Idle" as AvailIdle {
        [*]: text-secondary\nMedia icon + Label\nDrag handle hidden
    }
    state "Available Row — Hover" as AvailHover {
        [*]: bg clay 8%\nDrag handle visible (right)\ncursor pointer
    }
    state "Active Row — Idle" as ActiveIdle {
        [*]: text-primary\nMedia icon + Label\nDrag handle hidden
    }
    state "Active Row — Hover" as ActiveHover {
        [*]: bg clay 8%\nDrag handle visible (right, opacity 1)\ncursor grab on handle
    }
    state "Row — Dragging" as Dragging {
        [*]: elevated shadow\nopacity 0.8\ncursor grabbing\nplaceholder shown in source list
    }
    state "Row — Selected" as Selected {
        [*]: bg clay 14% persistent\nborder-left 2px clay\npart of multi-select group
    }
    state "Selected + Hover" as SelectedHover {
        [*]: bg clay 18%\nDrag handle visible (right)\ncursor grab
    }

    AvailIdle --> AvailHover: mouseenter
    AvailHover --> AvailIdle: mouseleave
    AvailHover --> ActiveIdle: click to activate
    AvailHover --> Dragging: mousedown on drag handle
    Dragging --> ActiveIdle: drop in Active section
    Dragging --> AvailIdle: drop in Available section

    ActiveIdle --> ActiveHover: mouseenter
    ActiveHover --> ActiveIdle: mouseleave
    ActiveHover --> Dragging: mousedown on drag handle

    AvailIdle --> Selected: Ctrl+Click
    ActiveIdle --> Selected: Ctrl+Click
    Selected --> AvailIdle: Ctrl+Click (deselect) / click without Ctrl
    Selected --> ActiveIdle: Ctrl+Click (deselect) / click without Ctrl
    Selected --> SelectedHover: mouseenter
    SelectedHover --> Selected: mouseleave
    SelectedHover --> Dragging: mousedown on drag handle (drags all selected)
```

## Row Layout

```
┌─────────────────────────────────────┐
│  [icon]   Property Name        [≡]  │
│  media    label           drag handle│
│  (leading)               (trailing)  │
└─────────────────────────────────────┘

  • Media icon: always visible, property-type icon (calendar, location_on, etc.)
  • Label: always visible, property name
  • Drag handle (≡): trailing, visible on hover only (Quiet Actions)
  • No × button anywhere
```
