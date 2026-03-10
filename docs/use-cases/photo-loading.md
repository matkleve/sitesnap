# Photo Loading — Use Cases & Interaction Scenarios

> **Related specs:** [photo-marker](../element-specs/photo-marker.md), [thumbnail-card](../element-specs/thumbnail-card.md), [thumbnail-grid](../element-specs/thumbnail-grid.md), [image-detail-view](../element-specs/image-detail-view.md)
> **Storage docs:** Supabase Storage Image Transformations (signed URLs with `transform` options)

---

## Overview

Photos flow through a **four-tier progressive loading pipeline**. Each tier serves a different surface at a different resolution. Placeholder images fill every tier until a real file exists in Supabase Storage, ensuring the UI never shows a blank marker or broken `<img>`.

### Tier Summary

| Tier | Surface                     | Resolution     | Source                                                      | Fallback                          |
| ---- | --------------------------- | -------------- | ----------------------------------------------------------- | --------------------------------- |
| 0    | Map marker (far/mid zoom)   | None (no img)  | Count badge only                                            | —                                 |
| 1    | Map marker (near zoom ≥ 16) | 80 × 80 px     | Signed URL + `transform { width: 80, height: 80, cover }`   | CSS placeholder (gradient + icon) |
| 2    | Thumbnail Grid card         | 256 × 256 px   | Signed URL + `transform { width: 256, height: 256, cover }` | CSS placeholder (gradient + icon) |
| 3    | Image Detail View           | Original / max | Signed URL (no transform, or capped at 2500px)              | Tier 2 URL shown while loading    |

---

## PL-1: Marker Enters Viewport at Near Zoom

**Context:** User pans or zooms so that single-image markers appear at zoom ≥ 16. The viewport query returns rows with `storage_path` / `thumbnail_path`. No thumbnail URL is loaded yet.

```mermaid
sequenceDiagram
    actor User
    participant MapShell
    participant MarkerFactory
    participant SupabaseStorage as Supabase Storage

    User->>MapShell: Pan / zoom (moveend at zoom ≥ 16)
    MapShell->>MapShell: queryViewportMarkers()
    Note over MapShell: Response rows include storage_path & thumbnail_path
    MapShell->>MarkerFactory: buildPhotoMarkerHtml({ count: 1, thumbnailUrl: undefined })
    MarkerFactory-->>MapShell: HTML with CSS placeholder (no <img>)
    Note over MapShell: Marker renders instantly with placeholder
    MapShell->>MapShell: maybeLoadThumbnails()
    loop For each visible single marker without thumbnailUrl
        MapShell->>SupabaseStorage: createSignedUrl(thumbnailSourcePath, 3600, { transform: 80×80 })
        alt File exists in storage
            SupabaseStorage-->>MapShell: signedUrl
            MapShell->>MarkerFactory: refreshPhotoMarker() → <img src=signedUrl>
            Note over MapShell: Marker transitions from placeholder → real photo
        else File missing (seed data / deleted)
            SupabaseStorage-->>MapShell: error
            Note over MapShell: Marker keeps CSS placeholder
        end
    end
```

**Expected state after:**

- Markers with real storage files show photo thumbnails
- Markers without storage files show a styled CSS placeholder (not a broken image icon)

---

## PL-2: Thumbnail Grid Loads for Active Selection

**Context:** User clicks a marker or cluster → Workspace Pane opens → Thumbnail Grid renders. Each card needs a 256×256 thumbnail. Signing is triggered immediately by `WorkspaceViewService.loadMultiClusterImages()` after setting `rawImages`.

```mermaid
sequenceDiagram
    actor User
    participant MapShell
    participant ViewService as WorkspaceViewService
    participant Storage as Supabase Storage
    participant Card as ThumbnailCard

    User->>MapShell: Click marker / cluster
    MapShell->>ViewService: loadMultiClusterImages(cells, zoom)
    ViewService->>ViewService: rawImages.set(images)
    Note over Card: Cards render with pulsing placeholder (gradient + camera icon)
    ViewService->>ViewService: batchSignThumbnails(images)

    par Images with thumbnailPath (batch)
        ViewService->>Storage: createSignedUrls(paths[], 3600)
        Storage-->>ViewService: signedUrls[]
    and Images without thumbnailPath (individual + transform)
        ViewService->>Storage: createSignedUrl(storagePath, 3600, { transform: 256×256 }) × N
        Storage-->>ViewService: signedUrl per image
    end

    ViewService->>ViewService: rawImages.update(apply URLs or set thumbnailUnavailable)

    alt signedUrl received
        Card->>Card: <img> starts loading
        alt img onload
            Card->>Card: Pulse stops → photo fades in (200ms)
        else img onerror (file 404)
            Card->>Card: Pulse stops → no-photo icon (crossed-out image, 0.55 opacity)
        end
    else thumbnailUnavailable (no URL produced)
        Card->>Card: Immediate no-photo icon, no pulse
    end

    Note over ViewService: On scroll, grid's scheduleThumbnailSigning() signs additional cards
```

**Expected state after:**

- Cards pulse while signed URLs are being fetched and images are downloading
- Cards with real storage files show photo thumbnails (fade-in)
- Cards where the file is missing show a static no-photo icon (crossed-out image)
- `thumbnailUnavailable` flag prevents re-signing on scroll
- No broken `<img>` icons anywhere

---

## PL-3: Image Detail View Opens

**Context:** User clicks a thumbnail card → Image Detail View replaces the grid. Needs to load the full-resolution image progressively.

```mermaid
sequenceDiagram
    actor User
    participant ThumbnailCard
    participant ImageDetailView
    participant SupabaseStorage as Supabase Storage

    User->>ThumbnailCard: Click
    ThumbnailCard->>ImageDetailView: Open with imageId
    ImageDetailView->>ImageDetailView: Show Tier 2 thumbnail immediately (already signed)
    ImageDetailView->>SupabaseStorage: createSignedUrl(storage_path, 3600)
    Note over SupabaseStorage: Full resolution, no transform
    alt File exists
        SupabaseStorage-->>ImageDetailView: fullResUrl
        ImageDetailView->>ImageDetailView: Preload in hidden <img>
        ImageDetailView->>ImageDetailView: On load → crossfade to full-res
    else File missing
        SupabaseStorage-->>ImageDetailView: error
        ImageDetailView->>ImageDetailView: Keep Tier 2 thumbnail (or placeholder)
    end
```

**Expected state after:**

- Thumbnail (Tier 2) shows instantly
- Full-resolution image fades in once loaded
- If no file exists, Tier 2 or placeholder remains
- `fullResLoaded` signal is `true` once the high-res image completes

---

## PL-4: Fresh Upload — Optimistic Marker + Real Thumbnail

**Context:** User uploads a photo via Upload Panel. The client has the local `File` object and can create an `ObjectURL` immediately.

```mermaid
sequenceDiagram
    actor User
    participant UploadPanel
    participant UploadService
    participant SupabaseStorage as Supabase Storage
    participant MapShell
    participant MarkerFactory

    User->>UploadPanel: Drop / select file
    UploadPanel->>UploadPanel: thumbnailUrl = URL.createObjectURL(file)
    UploadPanel->>UploadService: upload(file, metadata)
    UploadService->>SupabaseStorage: storage.upload(path, file)
    UploadService-->>MapShell: ImageUploadedEvent { lat, lng, thumbnailUrl (objectURL) }
    MapShell->>MarkerFactory: buildPhotoMarkerHtml({ thumbnailUrl: objectURL })
    Note over MapShell: Marker shows real photo immediately (from local file)
    SupabaseStorage-->>UploadService: Upload complete
    Note over MapShell: Next viewport query reconciles — signed URL replaces objectURL
    MapShell->>MapShell: URL.revokeObjectURL(objectURL)
```

**Expected state after:**

- Marker shows real photo thumbnail from the moment of upload
- No placeholder needed — the local `File` blob serves as the thumbnail
- After viewport reconciliation, the signed storage URL takes over

---

## PL-5: Zoom Out — Thumbnail to Count Badge Transition

**Context:** User zooms out from near (≥ 16) to mid/far zoom (< 16). Individual markers collapse into clusters and thumbnails are no longer needed.

```mermaid
sequenceDiagram
    actor User
    participant MapShell
    participant MarkerFactory

    User->>MapShell: Zoom out (zoom < 16)
    MapShell->>MapShell: getPhotoMarkerZoomLevel() → 'mid' or 'far'
    MapShell->>MapShell: queryViewportMarkers()
    Note over MapShell: Server returns clusters (count > 1)
    MapShell->>MarkerFactory: buildPhotoMarkerHtml({ count: N, thumbnailUrl: undefined })
    MarkerFactory-->>MapShell: HTML with count badge (no thumbnail)
    Note over MapShell: Signed URL cache is not cleared — survives for next zoom-in
```

**Expected state after:**

- Cluster markers show count badges
- Thumbnail URLs from previous near-zoom session are retained in `PhotoMarkerState.thumbnailUrl`
- Re-zooming to near zoom re-renders thumbnails instantly from cache

---

## PL-6: Signed URL Expiry & Refresh

**Context:** User stays on the map for >1 hour. Signed URLs expire (default TTL: 3600s). Thumbnails fail to load.

```mermaid
sequenceDiagram
    actor User
    participant MapShell
    participant SupabaseStorage as Supabase Storage

    Note over MapShell: Signed URL created at T=0, TTL=3600s
    User->>MapShell: Interacts at T=3601s
    MapShell->>MapShell: moveend → queryViewportMarkers()
    MapShell->>MapShell: maybeLoadThumbnails()
    loop For markers with expired/missing thumbnailUrl
        MapShell->>SupabaseStorage: createSignedUrl(path, 3600)
        SupabaseStorage-->>MapShell: New signedUrl
        MapShell->>MapShell: refreshPhotoMarker() with new URL
    end
```

**Strategy:** On each viewport query, clear `thumbnailUrl` for markers whose URL was signed > 50 minutes ago (proactive refresh before expiry). This avoids flicker from expired URLs.

---

## Placeholder Design

When no real image file exists in Supabase Storage (seed data, deleted files, failed uploads), the placeholder must:

1. **Visually communicate "photo expected here"** — not a broken image icon
2. **Match the marker / card geometry exactly** — same border-radius, same aspect ratio
3. **Be lightweight** — no network request, pure CSS
4. **Be deterministic** — same image ID always produces the same visual (for consistency across reloads)

### Marker Placeholder (Tier 1)

The marker body shows a subtle camera icon (`📷`) centered on a neutral gradient background. The gradient hue is derived deterministically from the marker key hash (so each placeholder looks slightly different).

```
.map-photo-marker__body--placeholder {
  background: linear-gradient(135deg, var(--color-bg-subtle), var(--color-bg-muted));
  display: flex;
  align-items: center;
  justify-content: center;
}
.map-photo-marker__body--placeholder::after {
  content: '';
  width: 60%;
  height: 60%;
  background: var(--color-fg-muted);
  mask-image: url("data:image/svg+xml,...camera-icon...");
  mask-size: contain;
}
```

### Thumbnail Card Placeholder (Tier 2)

Same concept scaled to 128×128px. Shows a camera icon on a soft gradient. The date overlay and project badge still render normally.

### Image Detail Placeholder (Tier 3)

Full-width area with centered camera icon and "Image unavailable" text below. Uses the same gradient approach.
