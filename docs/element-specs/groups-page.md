# Groups Page

## What It Is

A management page for all named image groups. Lists existing groups with preview thumbnails, image count, and creation date. Allows creating, renaming, and deleting groups. Accessed via `/groups` route from the Sidebar.

## What It Looks Like

Full-width page. A header row with "Groups" title and a "New group" primary button. Below: a list or card grid of groups. Each group card shows: group name, thumbnail preview (first 4 images as a 2×2 mosaic), image count, and a context menu (⋯). Empty state when no groups exist.

**Mobile:** Cards stack full-width in a single column.

## Where It Lives

- **Route**: `/groups`
- **Parent**: App shell
- **Sidebar link**: Folder icon

## Actions

| #   | User Action          | System Response                                                | Triggers              |
| --- | -------------------- | -------------------------------------------------------------- | --------------------- |
| 1   | Navigates to /groups | Loads all groups for the org                                   | Supabase query        |
| 2   | Clicks "New group"   | Creates a new empty group, opens rename inline                 | Supabase insert       |
| 3   | Clicks a group card  | Navigates to map with that group selected in Workspace Pane    | Router + group filter |
| 4   | Clicks ⋯ → Rename    | Group name becomes inline editable                             | Focus input           |
| 5   | Clicks ⋯ → Delete    | Confirmation dialog, then deletes group (images not deleted)   | Supabase delete       |
| 6   | Sees empty state     | "No groups yet. Select images on the map and save as a group." | —                     |

## Component Hierarchy

```
GroupsPage                                 ← full-width, flex column
├── GroupsHeader
│   ├── Title "Groups"
│   └── NewGroupButton                     ← primary CTA "New group"
├── GroupGrid                              ← responsive card grid
│   └── GroupCard × N
│       ├── ThumbnailMosaic                ← 2×2 grid of first 4 image thumbs
│       ├── GroupName                       ← text, inline-editable on rename
│       ├── ImageCount                     ← "24 photos" secondary text
│       └── ContextMenu (⋯)               ← Rename, Delete
├── [loading] LoadingSpinner
└── [empty] EmptyState                     ← illustration + guidance text
```

## Data

| Field            | Source                                                     | Type                 |
| ---------------- | ---------------------------------------------------------- | -------------------- |
| Groups           | `supabase.from('groups').select('*, group_images(count)')` | `Group[]`            |
| Group thumbnails | First 4 images per group via join                          | `string[]` per group |

## State

| Name             | Type             | Default | Controls                         |
| ---------------- | ---------------- | ------- | -------------------------------- |
| `groups`         | `Group[]`        | `[]`    | Grid content                     |
| `loading`        | `boolean`        | `false` | Loading indicator                |
| `editingGroupId` | `string \| null` | `null`  | Which group name is being edited |

## File Map

| File                                    | Purpose                                |
| --------------------------------------- | -------------------------------------- |
| `features/groups/groups.component.ts`   | Page component (currently placeholder) |
| `features/groups/groups.component.html` | Template                               |
| `features/groups/groups.component.scss` | Styles                                 |
| `core/group.service.ts`                 | Group CRUD operations                  |

## Wiring

- Add route `{ path: 'groups', component: GroupsComponent }` in `app.routes.ts`
- Import `GroupsComponent` standalone
- Inject `GroupService` for loading and managing groups
- Sidebar "groups" link navigates to `/groups`

## Acceptance Criteria

- [ ] Lists all org groups as cards with thumbnail mosaic
- [ ] "New group" creates an empty group and opens rename
- [ ] Click card navigates to map with group selected
- [ ] Context menu: Rename (inline edit), Delete (with confirmation)
- [ ] Delete removes group but NOT the images inside it
- [ ] Empty state with guidance text
- [ ] Loading spinner during fetch
