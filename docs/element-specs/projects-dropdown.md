# Projects Dropdown

## What It Is

A dropdown for scoping the workspace view to one or more projects. Contains a search input at the top and a checklist of projects below. Checking projects filters the workspace to show only images belonging to those projects. Unchecking all shows all images (no project filter).

## What It Looks Like

Floating dropdown anchored below the "Projects" toolbar button. Width: 15rem (240px), max-height 20rem (scrollable). `--color-bg-elevated` background, `shadow-xl`, `rounded-lg` corners.

- **Search input** at top: compact, placeholder "Search projects…", `--text-small`.
- **"All projects" row**: first row, toggles all on/off. When all are checked, this shows a filled checkbox. When some are checked, it shows an indeterminate (–) checkbox.
- **Project rows**: each is a `.ui-item` with a checkbox, project name, and image count badge. Checked projects have `--color-primary` checkbox fill.
- **Bottom**: "+ New project" ghost button to create a project inline.

## Where It Lives

- **Parent**: `WorkspaceToolbarComponent`
- **Appears when**: User clicks the "Projects" toolbar button

## Actions

| #   | User Action                    | System Response                                         | Triggers                     |
| --- | ------------------------------ | ------------------------------------------------------- | ---------------------------- |
| 1   | Types in search input          | Filters visible projects by name                        | `searchTerm` changes         |
| 2   | Checks/unchecks a project      | Toggles project filter; workspace re-filters            | `selectedProjectIds` changes |
| 3   | Clicks "All projects" checkbox | Toggles all on (if any unchecked) or all off            | `selectedProjectIds` reset   |
| 4   | Clicks "+ New project"         | Inline name input appears; on Enter, project is created | New project created          |
| 5   | Clicks outside or Escape       | Closes dropdown; project filter remains active          | Dropdown closes              |

## Component Hierarchy

```
ProjectsDropdown                           ← floating dropdown, --color-bg-elevated, shadow-xl, rounded-lg
├── SearchInput                            ← compact, placeholder "Search projects…"
├── AllProjectsRow                         ← .ui-item with tri-state checkbox + "All projects" label
├── ProjectList                            ← scrollable
│   └── ProjectRow × N                     ← .ui-item
│       ├── Checkbox                       ← --color-primary when checked
│       ├── ProjectName                    ← text label
│       └── ImageCount                     ← badge, --text-caption, --color-text-secondary
├── [creating] NewProjectInput             ← inline text input, appears on + click
└── NewProjectButton                       ← ghost "+ New project"
```

## Data

| Field        | Source                                                                                                  | Type                  |
| ------------ | ------------------------------------------------------------------------------------------------------- | --------------------- |
| Projects     | `supabase.from('projects').select('id, name').eq('organization_id', org)`                               | `Project[]`           |
| Image counts | `supabase.from('images').select('project_id, count').group('project_id')` or derived from loaded images | `Map<string, number>` |

## State

| Name                 | Type          | Default | Controls                               |
| -------------------- | ------------- | ------- | -------------------------------------- |
| `searchTerm`         | `string`      | `''`    | Filters visible projects               |
| `selectedProjectIds` | `Set<string>` | empty   | Which projects are checked             |
| `isCreating`         | `boolean`     | `false` | Whether the new-project input is shown |
| `newProjectName`     | `string`      | `''`    | Name for the new project               |

## File Map

| File                                                           | Purpose                     |
| -------------------------------------------------------------- | --------------------------- |
| `features/map/workspace-pane/projects-dropdown.component.ts`   | Projects checklist dropdown |
| `features/map/workspace-pane/projects-dropdown.component.html` | Template                    |
| `features/map/workspace-pane/projects-dropdown.component.scss` | Styles                      |

## Wiring

- Rendered inside `WorkspaceToolbarComponent` via `@if (activeDropdown() === 'projects')`
- `selectedProjectIds` is passed to `WorkspaceViewService` which filters images
- Also informs `FilterService` (project filter is equivalent to a filter rule)
- Image counts are derived from the currently-loaded image set (no extra query)

## Acceptance Criteria

- [x] Search input at top filters projects by name
- [x] Each project row has a checkbox, name, and image count
- [x] "All projects" row with tri-state checkbox (all/some/none)
- [ ] Checking/unchecking updates workspace view immediately
- [ ] "+ New project" creates a project with inline name entry
- [ ] Closing dropdown does NOT clear project selection
- [ ] Empty search state: "No matching projects"
- [ ] Newly created project appears in list immediately
- [x] Dropdown uses `position: fixed` to escape overflow
- [x] Row hover: clay 8% background tint
- [x] Checked rows: text-primary, unchecked: text-secondary

---

## Projects Flow

```mermaid
sequenceDiagram
    participant U as User
    participant PD as ProjectsDropdown
    participant WVS as WorkspaceViewService
    participant Supa as Supabase
    participant WP as Workspace Content

    U->>PD: click "Projects" button
    PD->>Supa: fetch projects list
    Supa-->>PD: [{id, name}, ...]
    PD->>PD: render checklist

    U->>PD: check "Zürich-Nord"
    PD->>WVS: projectFilterChanged(Set['zurich-nord-id'])
    WVS->>WVS: filter images where project_id IN set
    WVS->>WP: emit filtered images

    U->>PD: check "Wien-Süd" (second project)
    PD->>WVS: projectFilterChanged(Set['zurich-nord-id', 'wien-sud-id'])
    WVS->>WP: emit filtered images (both projects)

    U->>PD: click "All projects" (tri-state → all)
    PD->>WVS: projectFilterChanged(empty set = no filter)
    WVS->>WP: emit all images
```

## Create New Project Flow

```mermaid
sequenceDiagram
    participant U as User
    participant PD as ProjectsDropdown
    participant Supa as Supabase
    participant PD2 as ProjectsDropdown (updated)

    U->>PD: click "+ New project"
    PD->>PD: show inline name input, focus
    U->>PD: type "Berlin-Mitte" + Enter
    PD->>Supa: insert into projects (name, organization_id)
    Supa-->>PD: {id: 'new-uuid', name: 'Berlin-Mitte'}
    PD->>PD2: add to project list, auto-check
    PD2->>PD2: emit projectFilterChanged with new project included
```

## Projects Dropdown — State Machine

```mermaid
stateDiagram-v2
    [*] --> AllSelected

    state AllSelected {
        [*]: "All projects" checked\nNo project filter active\nToolbar dot hidden\nAll rows checked
    }

    state SomeSelected {
        [*]: Subset of projects checked\n"All projects" shows indeterminate (–)\nToolbar dot visible (clay)\nFilter active
    }

    state NoneSelected {
        [*]: No projects checked\n"All projects" unchecked\nToolbar dot visible (clay)\nWorkspace shows no images
    }

    state Searching {
        [*]: searchTerm non-empty\nProject list filtered by name\nCheckbox states preserved
    }

    state EmptySearch {
        [*]: searchTerm matches no projects\n"No matching projects" shown
    }

    state CreatingProject {
        [*]: Inline name input visible\nInput focused\nUser typing project name
    }

    AllSelected --> SomeSelected: uncheck a project
    SomeSelected --> AllSelected: check "All projects"
    SomeSelected --> SomeSelected: check/uncheck individual project
    SomeSelected --> NoneSelected: uncheck all remaining
    NoneSelected --> SomeSelected: check a project
    NoneSelected --> AllSelected: check "All projects"
    AllSelected --> Searching: type in search input
    SomeSelected --> Searching: type in search input
    Searching --> EmptySearch: no projects match
    EmptySearch --> Searching: edit search (matches found)
    Searching --> AllSelected: clear search (all checked)
    Searching --> SomeSelected: clear search (partial)
    AllSelected --> CreatingProject: click "+ New project"
    SomeSelected --> CreatingProject: click "+ New project"
    CreatingProject --> SomeSelected: Enter (project created + auto-checked)
    CreatingProject --> AllSelected: Escape (cancel creation)
```

## "All Projects" Checkbox — Tri-State

```mermaid
stateDiagram-v2
    [*] --> Checked

    state Checked {
        [*]: All projects selected\nCheckbox = ✓\nNo filter applied
    }
    state Indeterminate {
        [*]: Some projects selected\nCheckbox = –\nFilter applied
    }
    state Unchecked {
        [*]: No projects selected\nCheckbox = empty\nFilter blocks all
    }

    Checked --> Indeterminate: uncheck one project
    Indeterminate --> Checked: click "All projects" (select all)
    Indeterminate --> Indeterminate: check/uncheck (still partial)
    Indeterminate --> Unchecked: uncheck all remaining
    Unchecked --> Checked: click "All projects"
```

## Project Row — Visual States

```mermaid
stateDiagram-v2
    state "Row Idle (Checked)" as IdleChecked {
        [*]: checkbox filled\ntext-primary\nimage count visible
    }
    state "Row Idle (Unchecked)" as IdleUnchecked {
        [*]: checkbox empty\ntext-secondary\nimage count dimmed
    }
    state "Row Hover" as Hover {
        [*]: bg clay 8%\ncursor pointer\nrow highlighted
    }

    IdleChecked --> Hover: mouseenter
    Hover --> IdleChecked: mouseleave (was checked)
    Hover --> IdleUnchecked: mouseleave (was unchecked)
    IdleUnchecked --> Hover: mouseenter
    Hover --> IdleUnchecked: click (uncheck)
    Hover --> IdleChecked: click (check)
```

## Create New Project Flow — States

```mermaid
stateDiagram-v2
    [*] --> ButtonVisible

    state ButtonVisible {
        [*]: "+ New project" link visible\nat bottom of dropdown
    }
    state InputVisible {
        [*]: Inline text input shown\nInput focused\nPlaceholder "Project name..."
    }
    state Saving {
        [*]: Input disabled\nSpinner visible\nSaving to Supabase
    }
    state Created {
        [*]: New row appears in list\nAuto-checked\nInput cleared\nBack to button
    }

    ButtonVisible --> InputVisible: click "+ New project"
    InputVisible --> Saving: Enter (name valid)
    InputVisible --> ButtonVisible: Escape (cancel)
    Saving --> Created: success
    Created --> ButtonVisible: transition complete
    Saving --> InputVisible: error (show message, re-enable)
```
