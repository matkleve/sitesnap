# Use Cases

**Who this is for:** engineers and product people implementing and validating flows.  
**What you’ll get:** concise narratives describing how technicians and clerks actually use GeoSite.

See `project-description.md` for the high-level vision and `features.md` for the full capability list.

---

## Personas

These personas describe the primary human actors in GeoSite. Each use case references one or more of them. Personas provide realistic context for why actors behave as they do — they are not user stories.

---

### Persona: Technician

**Real-world context:** A field worker employed by a construction or maintenance company. Works on-site, often without reliable internet. Uses a smartphone in varying conditions — direct sunlight, wet gloves, awkward angles. Their primary question when arriving at a location is: _"What has been done here before?"_ They are not interested in folder navigation or system administration.

**Device:** Smartphone (iOS or Android). Occasionally a ruggedized tablet.  
**Connectivity:** Intermittent. May have weak LTE, a Wi-Fi hotspot, or nothing at all in basements or remote sites.  
**Technical literacy:** Moderate. Comfortable with mobile apps; not comfortable with SQL, admin UIs, or file systems.

**Primary goals:**

- Find historical photos of the site they are currently standing on, ordered by proximity and recency.
- Upload new photos from the field and confirm correct map placement.
- Correct GPS drift without losing the original EXIF reading.

**Frustrations:**

- Folder-navigation systems that require knowing the exact file path or project code.
- Apps that fail silently when GPS is off or imprecise.
- Upload flows that lose metadata, give no feedback, or require desktop follow-up.

**Primary use cases:** UC1, UC3.

---

### Persona: Clerk

**Real-world context:** An office-based employee responsible for preparing quotes, material estimates, and project reports. Works at a desktop browser with stable connectivity. Has read access to multiple projects and needs to cross-reference historical site imagery when pricing or planning new work. Does not normally upload images.

**Device:** Desktop or laptop, modern browser.  
**Connectivity:** Reliable office or home Wi-Fi.  
**Technical literacy:** Moderate. Fluent in web apps and spreadsheets; not a developer.

**Primary goals:**

- Search historical images by address, project, time range, and material/metadata values.
- Review image detail and site condition without navigating complex folder trees.
- Build enough visual context to produce a confident, documented quote.

**Frustrations:**

- Retrieval systems that require knowing exact folder paths or project codes from memory.
- Slow image loads when reviewing many sites in sequence.
- Losing context (filter state, viewport position) when switching between images.

**Primary use cases:** UC2.

---

### Persona: Admin

**Real-world context:** A lead engineer, IT contact, or team lead responsible for access management. Understands team structure and project boundaries but is not necessarily a database administrator. Manages who can access what, sets up new team members, and troubleshoots permission issues. May use both the GeoSite admin UI and the Supabase dashboard depending on the task.

**Device:** Desktop browser; may also use Supabase dashboard directly.  
**Connectivity:** Reliable.  
**Technical literacy:** High. Comfortable with admin UIs, role models, and — when necessary — SQL consoles.

**Primary goals:**

- Grant or revoke elevated roles for team members without direct DB intervention.
- Understand at a glance who has access to which projects and images.
- Ensure new team members are correctly provisioned and existing ones are cleanly offboarded.

**Frustrations:**

- Permission systems that require a developer for every role change.
- Role models that are undocumented or opaque to non-developers.
- No audit trail or history of access changes.

**Primary use cases:** UC4.

---

## MVP Boundary

- In scope for MVP: UC1, UC2, UC3, UC4.
- Out of scope for MVP: UC5 (post-MVP, experimental).

---

## UC1 – Technician on Site (View History)

**Goal**  
See relevant historical images for the exact spot the technician is currently standing on, without guessing folder names.

**Actors**

- Technician (role: `user`) — see [Persona: Technician](#persona-technician)

**Preconditions**

- Technician has a valid account and is logged in.
- Their mobile device can acquire a reasonable GPS fix.

**Main Flow**

1. Technician opens GeoSite on a mobile device.
2. App centers the map on the technician’s current location (from GPS) or on a searched address.
3. Technician optionally adjusts filters (time range, project, metadata, max distance) to narrow results.
4. GeoSite queries the backend for images within the selected distance of the reference point.
5. Map displays markers (and/or clusters) for all relevant images.
6. Technician taps a marker to open the image detail:
   - Thumbnail (then full-resolution on demand).
   - Timestamp.
   - Project.
   - Metadata (e.g., “Material: Beton”).
7. Technician swipes or clicks through related images around the same spot.

**Postconditions**

- Technician has a clear visual history of the site from prior visits.

**Key Invariants**

- RLS ensures the technician only sees images they are allowed to see.
- Queries are bounding-box based; no attempt is made to fetch all images globally.

---

## UC2 – Clerk Preparing a Quote

**Goal**  
Use historical images to estimate work and materials for a new quote.

**Actors**

- Clerk (role: `user` or `viewer`) — see [Persona: Clerk](#persona-clerk)

**Preconditions**

- Clerk has a valid account and is logged in.
- Relevant projects and images already exist in the system.

**Main Flow**

1. Clerk opens GeoSite in a desktop browser.
2. Clerk searches for an address or navigates the map to the area of interest.
3. Clerk selects one or more **projects** relevant to the new quote.
4. Clerk narrows down the **time range** (e.g., last 2 years).
5. Clerk optionally filters by **metadata** (e.g., `Material = Beton`) and **max distance**.
6. Map and/or list view shows matching images:
   - Clustered on the map.
   - With thumbnails and metadata in a side panel or list.
7. Clerk opens individual images to inspect:
   - Condition of work.
   - Existing materials.
   - Complexity of site.
8. Clerk exports or notes relevant findings to incorporate into the quote.

**Postconditions**

- Clerk has enough visual context to produce a confident, justified quote.

**Key Invariants**

- Filters are all applied server-side.
- Only thumbnails are initially loaded for overview; full images only on demand.

---

## UC3 – Upload and Correct a New Image

**Goal**  
Upload a new photo from the field and correct its position if EXIF coordinates are off.

**Actors**

- Technician (role: `user`) — see [Persona: Technician](#persona-technician)

**Preconditions**

- Technician has a valid account and is logged in.
- Technician has taken one or more photos on a device with a camera.

**Main Flow**

1. Technician opens the upload screen (from the main UI or, in future, via a context action on the map).
2. Technician selects one or more images from the device.
3. For each image:
   - GeoSite uploads the file to Supabase Storage.
   - EXIF metadata is parsed for coordinates, timestamp, and direction (if available).
4. GeoSite places a marker for the image on the map using EXIF coordinates.
5. Technician reviews the marker:
   - If correct, they confirm and save.
   - If slightly off, they drag the marker to the correct place.
6. On save:
   - The original EXIF coordinates are stored as immutable reference.
   - The corrected coordinates are stored in dedicated fields.
   - The image record is assigned to a project and optional metadata.

**Postconditions**

- New image exists in the system with accurate map placement and preserved EXIF.

**Key Invariants**

- EXIF coordinates are never overwritten; corrections are additive.
- Ownership and access to the image are enforced via RLS.

---

## UC4 – Admin Managing Roles

**Goal**  
Grant or revoke elevated access for certain users (e.g., to act as admins).

**Actors**

- Admin (role: `admin`) — see [Persona: Admin](#persona-admin)

**Preconditions**

- Admin user exists and is logged in.

**Main Flow**

1. Admin navigates to a user management view (or uses SQL/console in early phases).
2. Admin selects a user.
3. Admin assigns or revokes roles (e.g., toggling `admin`).
4. Changes are persisted in `user_roles`.

**Postconditions**

- Future queries and RLS checks use the updated role assignments.

**Key Invariants**

- Only admins can grant the `admin` role.
- RLS checks use `user_roles` and `roles` as described in `security-boundaries.md`.

---

## UC5 – Right-Click Marker Creation (Post‑MVP, Experimental)

**Goal**  
Quickly anchor a new upload or marker at an arbitrary point on the map, even if there is no existing address match or EXIF data.

**Actors**

- Technician or clerk (role: `user` / `viewer`), post‑MVP — see [Persona: Technician](#persona-technician) and [Persona: Clerk](#persona-clerk).

**Preconditions**

- User has a valid account and is logged in.
- Map is loaded and visible at the desired area.

**Main Flow**

1. User right-clicks on the map at the desired location.
2. A context menu appears offering actions such as “Upload here” / “Create marker here”.
3. User selects an action (e.g., “Upload here”).
4. GeoSite opens the upload UI with coordinates pre-populated from the clicked map position.
5. User selects one or more files to upload and completes the normal upload flow.
6. On save, the image record is created with those coordinates as its initial position (to be corrected later if needed).

**Postconditions**

- New images (or markers) are anchored to the right-clicked location even without EXIF data.

**Notes**

- This flow is **post‑MVP / experimental** and does not replace the standard EXIF-based upload flow; it complements it.

---

## Notes

- Additional use cases (e.g., exporting data, advanced filtering) can be added here as the product evolves.
- Any new use case should link back to relevant features and, if needed, trigger new decisions in `decisions.md`.
