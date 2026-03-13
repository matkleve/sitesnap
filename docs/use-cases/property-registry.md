# Property Registry — Use Cases & Interaction Scenarios

> **Related specs:** [custom-properties](../element-specs/custom-properties.md), [sort-dropdown](../element-specs/sort-dropdown.md), [grouping-dropdown](../element-specs/grouping-dropdown.md), [filter-dropdown](../element-specs/filter-dropdown.md), [search-bar](../element-specs/search-bar.md)
> **Related use cases:** [workspace-view WV-3, WV-4, WV-6](workspace-view.md)

---

## Overview

Feldpost has four operators that act on image properties: **Sort**, **Grouping**, **Filter**, and **Search**. Each operator currently maintains its own hardcoded list of available properties. This leads to inconsistency — a property available for grouping may not appear in sort or filter.

The **Property Registry** is a shared service that owns the canonical list of available properties (built-in + custom). All operators consume from this single source. When a user creates a custom property (e.g., "Chimney Number"), it automatically appears in all four operators.

### Scenario Index

| ID   | Scenario                                    | Persona       |
| ---- | ------------------------------------------- | ------------- |
| PR-1 | Built-in properties shared across operators | Clerk         |
| PR-2 | Custom property appears in all operators    | Administrator |
| PR-3 | Chimney inspection workflow                 | Technician    |
| PR-4 | Sort reset from search bar                  | Clerk         |
| PR-5 | Sort search → clear → reset flow            | Clerk         |

---

## PR-1: Built-In Properties Shared Across Operators

**Product context:** All operators should offer the same built-in properties (Date, City, Project, etc.) from a single source of truth.

```mermaid
sequenceDiagram
    actor User
    participant Toolbar as WorkspaceToolbar
    participant Registry as PropertyRegistryService
    participant SortDD as SortDropdown
    participant GroupDD as GroupingDropdown
    participant FilterDD as FilterDropdown

    Note over Registry: Built-in properties loaded at init:<br/>[Date captured, Date uploaded, Name,<br/>Distance, Address, City, Country,<br/>District, Street, Project, User]

    User->>Toolbar: Click "Sort"
    Toolbar->>SortDD: Open
    SortDD->>Registry: allProperties()
    Registry-->>SortDD: Built-in props (filterable by sort capability)
    Note over SortDD: Shows 8 sortable properties

    User->>Toolbar: Click "Grouping"
    Toolbar->>GroupDD: Open
    GroupDD->>Registry: allProperties()
    Registry-->>GroupDD: Built-in props (filterable by group capability)
    Note over GroupDD: Shows 10 groupable properties

    User->>Toolbar: Click "Filter"
    Toolbar->>FilterDD: Open
    FilterDD->>Registry: allProperties()
    Registry-->>FilterDD: All properties with operator types
    Note over FilterDD: Shows all filterable properties
```

```mermaid
flowchart TD
    subgraph Registry["PropertyRegistryService"]
        direction TB
        BI["Built-in Properties"]
        CP["Custom Properties<br/>(from MetadataService)"]
        BI --> Merged["allProperties signal"]
        CP --> Merged
    end

    Merged --> Sort["SortDropdown<br/>filters: sortable"]
    Merged --> Group["GroupingDropdown<br/>filters: groupable"]
    Merged --> Filter["FilterDropdown<br/>filters: filterable"]
    Merged --> Search["SearchBar<br/>filters: searchable"]
```

**Expected state after:**

- Sort, Grouping, Filter, and Search all read from `PropertyRegistryService.allProperties()`
- Each operator filters for its own capability flags (e.g., `sortable`, `groupable`)
- No hardcoded property lists in individual components

---

## PR-2: Custom Property Appears in All Operators

**Product context:** An administrator creates a custom property "Material" (select type). It immediately appears in Sort, Grouping, Filter, and Search.

```mermaid
sequenceDiagram
    actor Admin
    participant Settings as PropertyManager
    participant MS as MetadataService
    participant DB as Supabase
    participant Registry as PropertyRegistryService
    participant SortDD as SortDropdown
    participant GroupDD as GroupingDropdown
    participant FilterDD as FilterDropdown

    Admin->>Settings: Click "+ New property"
    Admin->>Settings: Name: "Material", Type: Select
    Admin->>Settings: Add options: "Beton", "Stahl", "Holz"
    Admin->>Settings: Confirm

    Settings->>MS: createProperty({name: 'Material', type: 'select', options: [...]})
    MS->>DB: INSERT into metadata_keys + metadata_key_options
    DB-->>MS: {id: 'mat-uuid', key_name: 'Material', key_type: 'select'}
    MS-->>Registry: customProperties signal updated

    Registry->>Registry: allProperties = [...builtIn, Material]

    Note over SortDD: Next open: "Material" appears in sort options
    Note over GroupDD: Next open: "Material" in Available section
    Note over FilterDD: Next rule: "Material" in property dropdown<br/>with operators: is, is not, contains
```

```mermaid
stateDiagram-v2
    [*] --> NoCustomProps

    state NoCustomProps {
        [*]: Only built-in properties in all operators
    }

    state HasCustomProps {
        [*]: Built-in + custom properties everywhere
        [*]: Custom props tagged with type icon
    }

    NoCustomProps --> HasCustomProps: Admin creates property
    HasCustomProps --> HasCustomProps: Admin creates another
    HasCustomProps --> NoCustomProps: Admin deletes last custom property
```

---

## PR-3: Chimney Inspection Workflow

**Product context:** A construction company inspects chimneys. Each chimney has a number. The technician wants to photograph chimneys and tag each photo with the chimney number, then group and sort by that number.

```mermaid
sequenceDiagram
    actor Admin
    actor Tech as Technician
    participant Settings as PropertyManager
    participant MS as MetadataService
    participant IDV as ImageDetailView
    participant Registry as PropertyRegistryService
    participant GroupDD as GroupingDropdown
    participant SortDD as SortDropdown
    participant WVS as WorkspaceViewService
    participant Grid as ThumbnailGrid

    rect rgb(240, 245, 255)
        Note over Admin: Step 1: Admin sets up the property
        Admin->>Settings: Create property "Chimney Number" (type: number)
        Settings->>MS: createProperty({name: 'Chimney Number', type: 'number'})
        MS->>Registry: customProperties updated
    end

    rect rgb(240, 255, 240)
        Note over Tech: Step 2: Technician tags photos
        Tech->>IDV: Open photo detail
        Tech->>IDV: Click "+ Add a property"
        IDV->>IDV: Property Picker: shows "Chimney Number"
        Tech->>IDV: Select "Chimney Number"
        Tech->>IDV: Enter value "42"
        IDV->>MS: setValue(imageId, 'chimney-number-uuid', '42')
    end

    rect rgb(255, 245, 240)
        Note over Tech: Step 3: Technician groups by chimney
        Tech->>GroupDD: Activate grouping: "Chimney Number"
        GroupDD->>WVS: groupingsChanged([{id: 'chimney-number-uuid', label: 'Chimney Number', icon: 'tag'}])
        WVS->>WVS: Group images by chimney number value
        WVS-->>Grid: Groups: "12" (3 photos), "42" (5 photos), "7" (2 photos)

        Tech->>SortDD: Change Chimney Number direction ↑→↓
        SortDD->>WVS: sortChanged([{key: 'chimney-number-uuid', dir: 'desc'}])
        WVS-->>Grid: Groups sorted: 42, 12, 7 (numeric descending)
    end
```

```mermaid
flowchart TD
    subgraph Define["1. Define Property"]
        Create["Admin creates<br/>'Chimney Number'<br/>type: number"]
    end

    subgraph Tag["2. Tag Photos"]
        Photo1["📷 IMG_001.jpg<br/>Chimney Number: 42"]
        Photo2["📷 IMG_002.jpg<br/>Chimney Number: 12"]
        Photo3["📷 IMG_003.jpg<br/>Chimney Number: 42"]
        Photo4["📷 IMG_004.jpg<br/>—"]
    end

    subgraph Operate["3. Use in Operators"]
        direction TB
        Sort["Sort by Chimney Number ↑<br/>12, 42, 42, (empty last)"]
        Group["Group by Chimney Number<br/>▼ 12 — 1 photo<br/>▼ 42 — 2 photos<br/>▼ No value — 1 photo"]
        Filter["Filter: Chimney Number > 20<br/>→ 2 photos (both #42)"]
    end

    Define --> Tag --> Operate
```

**Key behaviors for custom properties in operators:**

- **Sort**: Custom number properties sort numerically. Text properties sort alphabetically. Images without a value sort last.
- **Group**: Group heading = the value. Images without a value go under "No value" heading.
- **Filter**: Operators adapt to type — number gets `=`, `≠`, `>`, `<`, `≥`, `≤`; text gets `contains`, `equals`, `is not`.
- **Search**: Custom property values are included in the full-text search.

---

## PR-4: Sort Reset from Search Bar

**Product context:** The sort dropdown has a "Reset to default" button. The user wants it to be contextual — appearing as a reset icon inside the search bar when sorts are active, but not when the user is typing a search.

```mermaid
sequenceDiagram
    actor User
    participant SortDD as SortDropdown

    Note over SortDD: Default sort: [date-captured ↓]<br/>Search bar: empty, no trailing icon

    User->>SortDD: Activate City sort (→ ↑)
    Note over SortDD: activeSorts = [date-captured ↓, city ↑]<br/>Search bar: shows ⟲ reset icon at right

    User->>SortDD: Click ⟲ reset icon
    SortDD->>SortDD: resetSort() → activeSorts = [date-captured ↓]
    Note over SortDD: Search bar: reset icon disappears<br/>(back to default sort)
```

```mermaid
stateDiagram-v2
    [*] --> NoIcon

    state NoIcon {
        [*]: Default sort active
        [*]: Search field empty
        [*]: No trailing icon
    }

    state ResetIcon {
        [*]: Custom sort active
        [*]: Search field empty
        [*]: ⟲ reset icon visible
    }

    state ClearIcon {
        [*]: Search field has text
        [*]: × clear icon visible
        [*]: (sort state irrelevant)
    }

    NoIcon --> ResetIcon: User activates a sort
    ResetIcon --> NoIcon: User clicks ⟲ (reset)
    ResetIcon --> ClearIcon: User types in search
    ClearIcon --> ResetIcon: User clicks × (clear search)<br/>AND sorts are active
    ClearIcon --> NoIcon: User clicks × (clear search)<br/>AND sorts are default
    NoIcon --> ClearIcon: User types in search
    ClearIcon --> ClearIcon: User keeps typing
```

---

## PR-5: Sort Search → Clear → Reset Flow

**Product context:** Full interaction flow showing the transition between search clear (×) and sort reset (⟲) icons.

```mermaid
sequenceDiagram
    actor User
    participant Search as Sort Search Bar
    participant SortDD as SortDropdown
    participant WVS as WorkspaceViewService

    Note over Search: State: empty, sorts active → ⟲ icon shown

    User->>Search: Types "cit"
    Search->>Search: searchTerm = "cit"
    Search->>Search: Trailing icon switches: ⟲ → ×
    Note over Search: × clear icon shown (search has text)
    SortDD->>SortDD: filteredOptions updates (shows "City")

    User->>Search: Clicks × (clear search)
    Search->>Search: searchTerm = ""
    Search->>Search: Check: hasCustomSort?
    Search->>Search: Yes → trailing icon switches: × → ⟲
    Note over Search: ⟲ reset icon shown (search empty, sorts active)
    SortDD->>SortDD: filteredOptions shows all options

    User->>Search: Clicks ⟲ (reset sort)
    Search->>SortDD: resetSort()
    SortDD->>WVS: sortChanged([date-captured ↓])
    Search->>Search: Check: hasCustomSort?
    Search->>Search: No → trailing icon: none
    Note over Search: No trailing icon (default state)
```

```mermaid
flowchart TD
    Start["Sort dropdown opened"] --> CheckSearch{Search field<br/>has text?}

    CheckSearch -->|Yes| ShowX["Show × clear icon"]
    CheckSearch -->|No| CheckSort{Custom sort<br/>active?}

    CheckSort -->|Yes| ShowReset["Show ⟲ reset icon"]
    CheckSort -->|No| ShowNone["No trailing icon"]

    ShowX -->|"User clicks ×"| ClearSearch["Clear search text"]
    ClearSearch --> CheckSort

    ShowReset -->|"User clicks ⟲"| ResetSort["Reset to default sort"]
    ResetSort --> CheckSort

    ShowX -->|"User deletes text manually"| CheckSearch
    ShowNone -->|"User types text"| CheckSearch
    ShowReset -->|"User types text"| CheckSearch
```

**Key rules:**

1. **Search text takes priority**: If the search field has any text, always show × (clear search).
2. **Reset only when idle**: The ⟲ (reset) icon only appears when search is empty AND sorts differ from default.
3. **No icon at rest**: When search is empty AND sorts are at default, show no trailing icon (clean state).
4. **One click, one action**: × only clears search. ⟲ only resets sort. Never both at once.
