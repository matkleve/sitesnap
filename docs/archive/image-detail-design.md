# Sitesnap – Component: Image Detail View

## 5.4 Image Detail View

Desktop: inline in the workspace pane (replaces the gallery, back arrow to return).
Mobile: full-screen overlay (back button top-left).

Layout:

```
┌─────────────────────────────────────────────┐
│ ← Back                              [Actions ⋯] │
├─────────────────────────────────────────────┤
│                                             │
│        Full-resolution image                │
│        (loads progressively from thumb)     │
│                                             │
├─────────────────────────────────────────────┤
│ Timestamp: 14 Aug 2025, 09:47               │
│ Uploader: M. Kleve                          │
│ Project: Renovation Zürich-Nord             │
│ ─────────────────────────────────           │
│ 📍 Coordinates (corrected)    [Edit Location] │
│    47.3769° N, 8.5417° E                    │
│    ↳ EXIF: 47.3770° N, 8.5419° E (12m off) │
│    [Reset to EXIF]                          │
│ ─────────────────────────────────           │
│ Metadata                                    │
│  Material        Beton              (click) │
│  Work stage      Pre-treatment      (click) │
│  [+ Add property]                           │
│ ─────────────────────────────────           │
│ ◀  Previous image    Next image  ▶          │
└─────────────────────────────────────────────┘
```

**Metadata property rows (Notion pattern — Principle 1.8):** Each metadata entry is a two-column property row. The key is left-aligned in `--color-text-secondary` (`--text-small`); the value is right-aligned in `--color-text-primary` (`--text-body`). Clicking the value cell activates an inline text input in place — no separate "Edit" button or modal. Clicking outside commits the change. A `[+ Add property]` ghost row at the bottom creates a new key/value pair. The `[Edit]` button is removed entirely.

**Coordinates are the exception:** the "Edit Location" link opens a dedicated map-picker modal rather than an inline input, because placing a pin on a map cannot be done in a text field. Inline editing applies only to free-text and enum metadata values.

Actions menu (`⋯`): "Delete image", "Add to group", "Copy coordinates", "Download" (post-MVP).
