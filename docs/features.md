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

4. **Provider-agnostic image input layer**
   - All image sources implement the `ImageInputAdapter` interface (`listSources`, `fetchFile`, `getMetadata`).
   - The core ingestion pipeline (EXIF parse → Storage upload → DB write) depends only on `ImageInputAdapter`, never on a concrete adapter.
   - Swapping or adding an input source requires implementing the interface and registering in Angular DI. No changes to ingestion logic.
   - See `architecture.md` section 5 and `decisions.md` (D10).
5. **Local upload (MVP default — `LocalUploadAdapter`)**
   - Wraps the browser `<input type="file">` API.
   - User selects one or more photos from their device.
   - Files are uploaded to Supabase Storage with UUID-based paths/names.
6. **Automatic EXIF extraction**
   - Extract latitude, longitude, timestamp, and direction/bearing when available.
   - Store EXIF coordinates separately from corrected coordinates.
7. **Map preview before save**
   - Image appears as a map marker after EXIF parse.
   - User can confirm or adjust location before final save.
8. **Marker correction**
   - User may drag marker to correct positional error.
   - Corrected coordinates are stored in separate fields.

---

### 1.3 Spatial and Temporal Exploration

9. **Map-first main screen layout**
   - Map as primary canvas.
   - Address search bar with autocomplete.
   - Adjacent filter panel (time, project, metadata, max distance).
   - Upload entry point in map pane.
10. **Address search via geocoding service**
    - Uses a provider-agnostic geocoding boundary.
    - Behavior contract is defined in `architecture.md` and `decisions.md` (D6).
11. **Interactive map navigation via `MapAdapter`**
    - Map rendering is abstracted behind the `MapAdapter` interface; Angular components never import Leaflet directly.
    - Default implementation: `LeafletOSMAdapter` (Leaflet + OpenStreetMap tiles).
    - Swapping map providers requires only replacing the adapter and updating DI registration. No component changes.
    - See `architecture.md` section 6 and `decisions.md` (D3, D8).
    - Markers update based on viewport.
12. **Viewport-bounded loading**
    - Fetch only images in visible map region.
    - Server-side pagination and limits.
13. **Marker clustering**
    - Cluster dense regions to preserve readability and performance.
14. **Timeline filtering**
    - Time range filter limits displayed images.
15. **Detail view**
    - Thumbnail/full image, capture time, project, metadata, and owner.

---

### 1.4 Project and Metadata

16. **Project assignment**
    - Each image can be associated with one project.
17. **Project filtering**
    - Users can filter images by one or more projects.
18. **Flexible metadata system**
    - User-defined metadata keys and values per image.
    - Filter by metadata key/value.

---

### 1.5 Distance Filtering

19. **Distance-based filtering**
    - Restrict results by max distance from a reference point.
    - Presets (for example, 25m/50m/100m) and optional custom value.
    - Distance uses effective display coordinates (corrected first, else EXIF).

---

### 1.6 Security and Performance

20. **RLS-enforced ownership and roles**
    - All access enforcement in PostgreSQL RLS, not in Angular.
21. **Storage security**
    - User-scoped upload paths with UUID naming.
    - Explicit policy for signed vs public access.
22. **Performance guardrails**
    - Spatial and temporal filtering is server-side.
    - Thumbnails for overview, full-resolution on demand.
    - Indexes support viewport, timeline, and metadata filters.

See `architecture.md`, `database-schema.md`, and `security-boundaries.md`.

---

### 1.7 MVP Feature-to-Use-Case Mapping

| MVP Feature Group                  | Feature IDs | Primary Use Cases  |
| ---------------------------------- | ----------- | ------------------ |
| Authentication and User Management | 1-3         | UC1, UC2, UC3, UC4 |
| Image Ingestion                    | 4-8         | UC3                |
| Spatial and Temporal Exploration   | 9-15        | UC1, UC2           |
| Project and Metadata               | 16-18       | UC2, UC3           |
| Distance Filtering                 | 19          | UC1, UC2           |
| Security and Performance           | 20-22       | UC1, UC2, UC3, UC4 |
| UI and Theming                     | 23-25       | UC1, UC2, UC3, UC4 |

MVP use cases are UC1-UC4. UC5 is post-MVP and does not gate MVP release.

---

### 1.8 UI and Theming

23. **Tailwind CSS as styling foundation**
    - All component styles use Tailwind utility classes.
    - No CSS-in-JS or separate theming library.
    - Brand colors, surface colors, and text tokens are defined as CSS custom properties (`--color-primary`, `--color-surface`, etc.) and mirrored in `tailwind.config.js` as `theme.extend` values.
    - See `architecture.md` section 7 and `decisions.md` (D9).
24. **First-class dark mode**
    - Tailwind configured with `darkMode: 'class'`; the `dark` class is applied on `<html>` by a `ThemeService`.
    - Every component ships with both light and `dark:` Tailwind variants. Shipping without dark mode is a defect, not a deferral.
    - User preference is persisted to `localStorage`.
25. **Theme token system**
    - Design tokens are CSS custom properties, enabling runtime theme switching without a rebuild.
    - Map tile layers adapt to dark mode via `MapAdapter.setTileStyle('light' | 'dark')`; adapters that lack a dark tile URL may no-op this call.

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
8. Right-click map actions (upload/create marker here) — UC5.
9. `GoogleDriveAdapter` and other `ImageInputAdapter` implementations (local file upload is the MVP default).
10. Alternative `MapAdapter` implementations (Google Maps, Mapbox, etc.); `LeafletOSMAdapter` is the MVP default.
