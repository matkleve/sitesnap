# Photos Page

## What It Is

A full-screen photo gallery that shows all images in the user's organization. Responsive thumbnail grid with sorting, filtering, and pagination. This is a standalone page (not the Workspace Pane grid), accessed via `/photos` route from the Sidebar.

## What It Looks Like

Full-width page with a top toolbar (sort controls, filter trigger) and a responsive thumbnail grid below. Thumbnails are square (128–160px depending on viewport), laid out as a CSS grid that fills available width. Cursor-based pagination (infinite scroll or "Load more" button). Empty state when no images exist.

**Mobile:** Grid narrows to 3 columns. Toolbar collapses to icon buttons.

## Where It Lives

- **Route**: `/photos`
- **Parent**: App shell (same level as Map Shell, swapped via router)
- **Sidebar link**: Photo camera icon

## Actions

| #   | User Action                   | System Response                                        | Triggers            |
| --- | ----------------------------- | ------------------------------------------------------ | ------------------- |
| 1   | Navigates to /photos          | Loads first page of images, shows grid                 | Supabase query      |
| 2   | Scrolls to bottom             | Loads next page (cursor pagination)                    | Append to grid      |
| 3   | Changes sort (Date ↓/↑, Name) | Re-queries with new sort, resets grid                  | Grid refreshed      |
| 4   | Clicks a thumbnail            | Opens Image Detail View                                | Navigate or overlay |
| 5   | Opens filter panel            | Same filter controls as map (time, project, metadata)  | `FilterService`     |
| 6   | Sees empty state              | "No photos yet. Upload your first image." + upload CTA | —                   |

## Component Hierarchy

```
PhotosPage                                 ← full-width, flex column
├── PhotosToolbar
│   ├── SortControl                        ← dropdown: Date (newest), Date (oldest), Name
│   ├── FilterTrigger                      ← opens filter panel
│   └── PhotoCount                         ← "142 photos" label
├── PhotoGrid                              ← CSS grid, responsive columns
│   └── PhotoGridItem × N                  ← thumbnail + date overlay, click → detail
├── [loading] LoadingSpinner               ← shown during fetch
├── [end] EndOfList                        ← "All photos loaded" or load-more button
└── [empty] EmptyState                     ← illustration + "No photos yet" + upload CTA
```

## Data

| Field          | Source                                                                | Type       |
| -------------- | --------------------------------------------------------------------- | ---------- |
| Images         | `supabase.from('images').select(...)`                                 | `Image[]`  |
| Thumbnail URLs | Supabase Storage signed URLs (thumbnail variant)                      | `string[]` |
| Total count    | `supabase.from('images').select('*', { count: 'exact', head: true })` | `number`   |

## State

| Name      | Type                                  | Default       | Controls                 |
| --------- | ------------------------------------- | ------------- | ------------------------ |
| `images`  | `Image[]`                             | `[]`          | Grid content             |
| `sortBy`  | `'date_desc' \| 'date_asc' \| 'name'` | `'date_desc'` | Sort order               |
| `cursor`  | `string \| null`                      | `null`        | Pagination cursor        |
| `hasMore` | `boolean`                             | `true`        | Whether more pages exist |
| `loading` | `boolean`                             | `false`       | Loading indicator        |

## File Map

| File                                    | Purpose                                |
| --------------------------------------- | -------------------------------------- |
| `features/photos/photos.component.ts`   | Page component (currently placeholder) |
| `features/photos/photos.component.html` | Template                               |
| `features/photos/photos.component.scss` | Styles                                 |
| `core/image.service.ts`                 | Image querying, pagination, sorting    |

## Acceptance Criteria

- [ ] Responsive thumbnail grid fills available width
- [ ] Cursor-based pagination (infinite scroll or load-more)
- [ ] Sort by date (newest/oldest) and name
- [ ] Click thumbnail opens Image Detail View
- [ ] Empty state with upload CTA when no images
- [ ] Loading spinner during fetch
- [ ] Thumbnail URLs are signed (never expose raw storage paths)
