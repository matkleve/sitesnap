# Features (MVP and Beyond)

**Who this is for:** engineers and product owners deciding what to implement.  
**What you'll get:** a numbered list of capabilities and constraints for GeoSite.

---

## 1. MVP Features

These features define the first shippable version of GeoSite and map to `use-cases.md`.

### 1.1 Authentication and User Management

1. **User registration and login**
   - Implemented via Supabase Auth (email/password).
   - New users automatically receive a default role (for example, `user`) via trigger.
2. **Session handling**
   - Angular stores the active session/JWT and forwards it with Supabase calls.
3. **Account deletion**
   - Deleting a user from `auth.users` cascades to `profiles`, `user_roles`, and owned `images`.

See `user-lifecycle.md` for lifecycle details.

---

### 1.2 Image Ingestion

4. **Image upload from device**
   - User selects one or more photos.
   - Files are uploaded to Supabase Storage with UUID-based paths/names.
5. **Automatic EXIF extraction**
   - Extract latitude, longitude, timestamp, and direction/bearing when available.
   - Store EXIF coordinates separately from corrected coordinates.
6. **Map preview before save**
   - Image appears as a map marker after EXIF parse.
   - User can confirm or adjust location before final save.
7. **Marker correction**
   - User may drag marker to correct positional error.
   - Corrected coordinates are stored in separate fields.

---

### 1.3 Spatial and Temporal Exploration

8. **Map-first main screen layout**
   - Map as primary canvas.
   - Address search bar with autocomplete.
   - Adjacent filter panel (time, project, metadata, max distance).
   - Upload entry point in map pane.
9. **Address search via geocoding service**
   - Uses a provider-agnostic geocoding boundary.
   - Behavior contract is defined in `architecture.md` and `decisions.md` (D6).
10. **Interactive map navigation**
    - Leaflet + OpenStreetMap rendering.
    - Markers update based on viewport.
11. **Viewport-bounded loading**
    - Fetch only images in visible map region.
    - Server-side pagination and limits.
12. **Marker clustering**
    - Cluster dense regions to preserve readability and performance.
13. **Timeline filtering**
    - Time range filter limits displayed images.
14. **Detail view**
    - Thumbnail/full image, capture time, project, metadata, and owner.

---

### 1.4 Project and Metadata

15. **Project assignment**
    - Each image can be associated with one project.
16. **Project filtering**
    - Users can filter images by one or more projects.
17. **Flexible metadata system**
    - User-defined metadata keys and values per image.
    - Filter by metadata key/value.

---

### 1.5 Distance Filtering

18. **Distance-based filtering**
    - Restrict results by max distance from a reference point.
    - Presets (for example, 25m/50m/100m) and optional custom value.
    - Distance uses effective display coordinates (corrected first, else EXIF).

---

### 1.6 Security and Performance

19. **RLS-enforced ownership and roles**
    - All access enforcement in PostgreSQL RLS, not in Angular.
20. **Storage security**
    - User-scoped upload paths with UUID naming.
    - Explicit policy for signed vs public access.
21. **Performance guardrails**
    - Spatial and temporal filtering is server-side.
    - Thumbnails for overview, full-resolution on demand.
    - Indexes support viewport, timeline, and metadata filters.

See `architecture.md`, `database-schema.md`, and `security-boundaries.md`.

---

### 1.7 MVP Feature-to-Use-Case Mapping

| MVP Feature Group | Feature IDs | Primary Use Cases |
|---|---|---|
| Authentication and User Management | 1-3 | UC1, UC2, UC3, UC4 |
| Image Ingestion | 4-7 | UC3 |
| Spatial and Temporal Exploration | 8-14 | UC1, UC2 |
| Project and Metadata | 15-17 | UC2, UC3 |
| Distance Filtering | 18 | UC1, UC2 |
| Security and Performance | 19-21 | UC1, UC2, UC3, UC4 |

MVP use cases are UC1-UC4. UC5 is post-MVP and does not gate MVP release.

---

## 2. Non-Goals (MVP) and Post-MVP Considerations

The following items are out of scope for MVP and may be considered post-MVP:

1. Advanced image editing (crop, annotate, measure).
2. Public/social sharing.
3. Complex hierarchical permission models.
4. Before/after overlays.
5. Heatmaps and analytics.
6. Offline mode.
7. Directional relevance.
8. Right-click map actions (upload/create marker here).
