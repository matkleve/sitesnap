# Architecture Documentation

**Who this is for:** engineers working on system design, data flows, and performance.  
**What you’ll get:** a high‑level view of how GeoSite is put together and where responsibilities and invariants sit.

See also: `project-description.md`, `database-schema.md`, `security-boundaries.md`, and `decisions.md`.

---

## 1. System Overview

GeoSite is a map‑first, geo‑based image management system.

Users can:

- Register and log in.
- Upload images.
- Store geographic coordinates.
- View images on a map.
- Move map markers to update coordinates.

The main screen is **map‑first**:

- A prominent address search bar with autocomplete.
- A filter panel (time, project, metadata, max distance) next to the map.
- An upload button in the map pane.
- A left sidebar for navigation (e.g., Map / Projects / Admin / …).
- A right-hand detail pane that opens when clicking markers or clusters.

The system uses a **Client–BaaS** architecture:

- **Frontend:** Angular SPA.
- **Backend/BaaS:** Supabase (Auth + PostgreSQL + Storage).
- **Map rendering:** Leaflet with OpenStreetMap tiles.

All critical invariants (ownership, access control, data integrity) are enforced in the database and Supabase configuration.

---

## 2. Architectural Layers

### Layer 1 — Identity (Authentication)

Handled entirely by Supabase Auth.

Responsibilities:

- User registration.
- Password hashing.
- JWT issuance.
- Session management.

Table involved:

- `auth.users` (managed by Supabase; not modified manually).

---

### Layer 2 — Domain Profile (Application User Data)

Custom table: `profiles`

Purpose:

- Store application-specific user data.
- Keep `auth.users` minimal.

This creates a 1:1 extension of `auth.users`.

---

### Layer 3 — Authorization (Roles System)

Custom tables:

- `roles`
- `user_roles`

Purpose:

- Define access control.
- Support multiple roles per user.
- Enable a scalable permission model.

Authorization is enforced at the database level using Row-Level Security (RLS).  
See `security-boundaries.md` for policy details and `decisions.md` (D2).

---

### Layer 4 — Domain Data

Primary table:

- `images`

Contains:

- Image metadata.
- Geographic coordinates (EXIF and corrected).
- Ownership reference to the user.
- Links to project and metadata structures (see `features.md` / `glossary.md`).

All domain data is protected via RLS policies.

---

## 3. Geocoding Boundary

GeoSite uses a **geocoding service** to translate addresses into coordinates for the main map search bar.

- At the architecture level, geocoding is treated as a **provider‑agnostic service**:
  - Exposed via an internal API or adapter.
  - Replaceable without changing the domain model.
- Default implementation assumption:
  - An OpenStreetMap/Nominatim‑style provider.

Address search behaviour:

- On exact or high-confidence match:
  - Center the map on the resolved coordinates.
- If no exact match is found:
  - Center on the closest available match.
  - Display an explicit notice (e.g., “Using closest match to …”); never fail silently.

The geocoding layer must not introduce provider‑specific concepts into the core schema; it only returns coordinates and basic address metadata.

---

## 4. Responsibility Boundaries

**Angular (Frontend):**

- UI rendering.
- Form validation.
- Calling Supabase.
- Rendering the map via Leaflet.
- **No security enforcement** (treated as untrusted).

**Supabase Auth:**

- Identity (registration, login, JWT).

**Database (PostgreSQL with RLS):**

- Authorization.
- Data integrity.
- Row-Level Security enforcement for `images`, roles, and other domain tables.

**Storage (Supabase Storage):**

- Secure file storage.
- Access policy enforcement for image files.

**Leaflet:**

- Visualization of spatial data only (via `LeafletOSMAdapter`; see section 6).

---

## 5. Image Input Layer

GeoSite treats image ingestion as a **provider-agnostic pipeline**. The core ingestion flow — EXIF parsing, Supabase Storage upload, and database record write — never imports a concrete input source directly. All input sources implement a common `ImageInputAdapter` interface.

This mirrors the same adapter-boundary pattern used for geocoding (section 3) and map rendering (section 6).

### Interface Contract

```typescript
interface ImageInputAdapter {
  /** Return selectable file references available from this source. */
  listSources(): Promise<ImageInputRef[]>;

  /** Fetch the raw File object for a given reference. */
  fetchFile(ref: ImageInputRef): Promise<File>;

  /** Return any source-level metadata the adapter can supply. */
  getMetadata(ref: ImageInputRef): Promise<ImageInputMetadata>;
}

interface ImageInputRef {
  id: string; // Opaque identifier within the adapter's namespace
  label: string; // Human-readable label (filename, Drive title, etc.)
  mimeType: string;
}

interface ImageInputMetadata {
  originalName?: string;
  sourceCreatedAt?: string; // ISO 8601
  [key: string]: unknown; // Adapter-specific extras; core ignores unknown keys
}
```

### Concrete Adapters

| Adapter              | Status   | Description                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------- |
| `LocalUploadAdapter` | MVP      | Wraps the browser `<input type="file">` API. Ships first.                  |
| `GoogleDriveAdapter` | Post-MVP | Fetches files via the Google Drive Picker API.                             |
| _(future)_           | Post-MVP | Any source (Dropbox, FTP, camera API) that implements `ImageInputAdapter`. |

### Invariants

- The ingestion pipeline depends only on `ImageInputAdapter`, never on `LocalUploadAdapter` or `GoogleDriveAdapter` directly.
- Adding a new source requires only: (a) implementing `ImageInputAdapter` and (b) registering it in Angular's DI container. No changes to core ingestion logic.
- `LocalUploadAdapter` is the MVP default. All other adapters are post-MVP drop-ins.

See `decisions.md` (D10) for rationale.

---

## 6. Map Rendering Layer

Map rendering is abstracted behind a `MapAdapter` interface. Angular components that display markers, clusters, and the base map depend on this interface — not on Leaflet directly. This prevents accidental lock-in to a specific map library without requiring any active plan to swap.

### Interface Contract

```typescript
interface MapAdapter {
  /** Initialize the map inside the given DOM container. */
  init(container: HTMLElement, options: MapInitOptions): void;

  /** Pan or fly the map to a coordinate. */
  setCenter(lat: number, lng: number, zoom?: number): void;

  /** Add a marker and return an opaque handle for later reference. */
  addMarker(lat: number, lng: number, options?: MarkerOptions): MarkerHandle;

  /** Remove a previously added marker by its handle. */
  removeMarker(handle: MarkerHandle): void;

  /** Register a click callback on a specific marker. */
  onMarkerClick(
    handle: MarkerHandle,
    callback: (handle: MarkerHandle) => void,
  ): void;

  /** Replace the current point set with clustered groups. */
  renderClusters(groups: ClusterGroup[]): void;

  /** Tear down the map instance and release all resources. */
  destroy(): void;
}
```

### Concrete Adapters

| Adapter             | Status   | Description                                                          |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `LeafletOSMAdapter` | MVP      | Leaflet with OpenStreetMap tiles. Default.                           |
| _(future)_          | Post-MVP | Google Maps, Mapbox, or any tile provider implementing `MapAdapter`. |

### Invariants

- Angular components import `MapAdapter` via Angular's DI injection token. They never import `LeafletOSMAdapter` or the Leaflet library directly.
- Tile-provider configuration (tile URL, attribution, API keys) lives entirely inside the adapter.
- Swapping map providers requires only replacing the adapter and updating the DI registration. No component changes.
- Leaflet remains the current default; the adapter boundary exists to prevent lock-in, not to encourage churn.
- The `LeafletOSMAdapter` exposes a `setTileStyle(style: 'light' | 'dark')` method so the theme service can switch tile sets when dark mode is active.

See `decisions.md` (D3 and D8) for rationale.

---

## 7. UI Theming Layer

GeoSite uses **Tailwind CSS** as its styling foundation. Dark mode and theming are **first-class build targets**, not post-MVP toggles. Any component that only supports light mode is considered incomplete.

### Configuration

- Tailwind is configured with `darkMode: 'class'` so that dark mode is activated by a CSS class on `<html>` (e.g., `<html class="dark">`), not exclusively by the OS media query.
- A `ThemeService` in Angular manages the active theme class and persists the user's choice to `localStorage`.
- Design tokens (brand colors, spacing scale, border radius) are defined in both `theme.extend` in `tailwind.config.js` and as CSS custom properties (`--color-primary`, `--color-surface`, etc.), enabling runtime overrides without a rebuild.

### Theme Token Contract

```css
/* Defined in styles.scss or a dedicated tokens file */
:root {
  --color-primary: theme("colors.blue.600");
  --color-surface: theme("colors.white");
  --color-surface-alt: theme("colors.gray.100");
  --color-text: theme("colors.gray.900");
  --color-text-muted: theme("colors.gray.500");
}

.dark {
  --color-primary: theme("colors.blue.400");
  --color-surface: theme("colors.gray.900");
  --color-surface-alt: theme("colors.gray.800");
  --color-text: theme("colors.gray.100");
  --color-text-muted: theme("colors.gray.400");
}
```

### Rules

- Every new UI component must carry both light and `dark:` Tailwind variants. A component shipped without dark mode support is a defect, not a deferral.
- Avoid hardcoded hex or RGB values in component templates. Use Tailwind utility classes or the CSS custom properties above.
- Map tile layers should visually adapt to dark mode where the provider supports a dark tile URL. The `MapAdapter` interface exposes `setTileStyle('light' | 'dark')` for this purpose; adapters that don't support dark tiles may no-op the call.

See `decisions.md` (D9) for rationale.
