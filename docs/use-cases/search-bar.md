# Search Bar — Use Cases

> **Element spec:** [element-specs/search-bar.md](../element-specs/search-bar.md)
> **Blueprint:** [implementation-blueprints/search-bar.md](../implementation-blueprints/search-bar.md)

Use cases are the source of truth. The state machine, actions table, component hierarchy, and technical details in the element spec all exist to serve these scenarios.

---

## UC-1: Quick address lookup (happy path)

**Who:** Field worker reviewing a site.
**Goal:** Navigate the map to Schleiergasse 18 in Vienna.

1. User clicks the search bar (or presses `Cmd/Ctrl+K`).
2. Dropdown opens showing recent searches — searches from the active project appear first.
3. User types `schl`. Ghost completion appears: `eiergasse 18, 1100 Wien` (from recents or DB).
4. User presses `Tab` → input becomes `schleiergasse 18, 1100 Wien`. New search triggers.
5. DB results render instantly (~100ms): "Schleiergasse 18, 1100 Wien — 47 photos" in the Addresses section.
6. Geocoder skeleton pulses for ~1s, then Places section appears with matching external results.
7. User presses `Enter` (or clicks the top result).
8. Map centers on Schleiergasse 18. Search Location Marker placed. Search bar shows committed state.

**Edge cases:**
- **EC-1a:** User types fast, changing query mid-flight → previous in-flight requests are cancelled, only latest query resolves.
- **EC-1b:** User's connection is slow → DB results still render from local cache; geocoder shows skeleton indefinitely until timeout (5s), then hides.
- **EC-1c:** Query matches nothing in DB → only geocoder section appears (no empty Addresses header).

## UC-2: Repeat searches across sessions

**Who:** Project manager returning to same sites daily.
**Goal:** Quickly get back to "Burgstraße 7" without retyping.

1. User focuses search bar.
2. Recent searches appear — "Burgstraße 7, 8001 Zürich" is first because it belongs to the active project and was used yesterday.
3. User clicks it. Map centers immediately. No network request needed.

**Edge cases:**
- **EC-2a:** User switches to a different project → recents re-rank; searches from the new project float to top.
- **EC-2b:** User hasn't searched on this project yet → general recents shown, ordered by recency.
- **EC-2c:** Recent list is full (20 entries) → oldest entry that doesn't belong to the active project is evicted.

## UC-3: Search for a named place (POI)

**Who:** Inspector looking for a specific building.
**Goal:** Find "Kuratorium für Verkehrssicherheit" on Schleiergasse.

1. User types `Kuratorium Schleiergasse`.
2. DB has no match (it's not a stored address).
3. Geocoder returns the POI with name and address.
4. Result row shows: **Kuratorium für Verkehrssicherheit** (bold) / `Schleiergasse 18, 1100 Wien` (secondary line).
5. User clicks → map centers.

**Edge cases:**
- **EC-3a:** Only the building name is typed (`Kuratorium`) → geocoder returns the POI; DB returns nothing; result still shown with formatted address.
- **EC-3b:** Nominatim returns verbose label `"Kuratorium für Verkehrssicherheit, 18, Schleiergasse, Schleierbaracken, KG Favoriten..."` → system formats it to `Schleiergasse 18, 1100 Wien`, not raw display_name.

## UC-4: Search with typos

**Who:** Anyone typing fast on mobile.
**Goal:** Find "Denisgasse" despite typing "denisgass".

1. User types `denisgass`.
2. DB `ilike` matches nothing (no exact substring). Fallback normalization: `denisgass` → street token correction → `denisgasse`.
3. Corrected query fires against DB and geocoder.
4. Results show with an "Approximate match" label.
5. A suggestion row appears: _"Did you mean Denisgasse 46?"_ — selecting it replaces the query and reruns search.

**Edge cases:**
- **EC-4a:** pg_trgm is available → DB fuzzy match returns `Denisgasse 46` directly with a similarity score; no fallback needed.
- **EC-4b:** Correction matches multiple streets → show all, ranked by image count (more-documented addresses first).
- **EC-4c:** Austrian/German suffix variations → `str.` ↔ `straße`, `g.` ↔ `gasse` are normalized before query.

## UC-5: Paste coordinates or map link

**Who:** Team member who got a GPS coordinate via chat.
**Goal:** Center map on `47.3769, 8.5417`.

1. User pastes `47.3769, 8.5417` into search bar.
2. System detects coordinate format (or Google Maps URL format).
3. Skips text search entirely. Centers map on coordinates.
4. Fires reverse-geocode to populate the committed label (e.g. `Schleiergasse 18, 1100 Wien`).

**Edge cases:**
- **EC-5a:** Google Maps URL pasted (`https://maps.google.com/...@47.3769,8.5417,...`) → coordinates extracted from URL.
- **EC-5b:** Coordinates are in DMS format (`47°22'36.8"N 8°32'30.1"E`) → converted to decimal.
- **EC-5c:** Reverse-geocode fails → label shows raw coordinates `47.3769, 8.5417`.

## UC-6: Search for a project or group

**Who:** Manager navigating to a specific project's context.
**Goal:** Open the "Hauptbahnhof Renovation" project.

1. User types `hauptbahnhof`.
2. DB content section shows: "Hauptbahnhof Renovation" (project icon, subtitle: "23 photos").
3. User clicks → Router navigates to the project's view.

**Edge cases:**
- **EC-6a:** Query matches both an address and a project name → both appear in their respective sections; project in "Projects & Groups", address in "Addresses".
- **EC-6b:** Multiple projects match → ranked by active project first, then by score.

## UC-7: Geocoder slow or failing

**Who:** Anyone on a slow connection or when Nominatim is down.
**Goal:** Still get useful results.

1. User types `burgstraße`.
2. DB results render in ~100ms: addresses from the organization's data.
3. Geocoder skeleton pulses for 1–2 seconds.
4. Geocoder times out (5s) or returns error → geocoder section quietly disappears. No error banner.
5. User selects from DB results.

**Edge cases:**
- **EC-7a:** Geocoder returns HTTP 429 → Edge Function queues and retries; client sees delay, not error.
- **EC-7b:** Edge Function is unreachable → geocoder section hides after timeout; DB results and recents function normally.
- **EC-7c:** DB also fails (Supabase down) → only recents are available (from localStorage).

## UC-8: Tab autocomplete from history

**Who:** Power user who searches the same addresses frequently.
**Goal:** Type 3 characters and get the full address via Tab.

1. User types `bur`. Ghost text appears: `gstraße 7, 8001 Zürich` (muted, after cursor).
2. User presses `Tab` → input becomes `burgstraße 7, 8001 Zürich`.
3. Full search fires with the completed query.

**Edge cases:**
- **EC-8a:** No prefix match exists → no ghost text; Tab moves focus to next element (default browser behavior).
- **EC-8b:** Multiple prefix matches → highest-priority source wins (recent > DB > previous geocoder commit).
- **EC-8c:** User types another character instead of Tab → ghost dismissed, recalculated.
- **EC-8d:** Ghost matches a recent from a different project → still shown, but if an active-project recent also matches, the active-project one wins.

## UC-9: Searching with active project filter

**Who:** Worker assigned to "Favoriten Site".
**Goal:** See results relevant to the active project first.

1. "Favoriten Site" is the active project (set via Projects Dropdown).
2. User types `schleier`.
3. DB address results from Favoriten Site are ranked first (project boost).
4. DB content matching "Favoriten Site" appears first in its section.
5. Geocoder results are biased toward Vienna (where the project's images are).

**Edge cases:**
- **EC-9a:** No images in active project near "schleier" → results from other projects shown, but without the project boost.
- **EC-9b:** User clears project filter → ranking reverts to pure score + image count.

## UC-10: Address not in the system yet

**Who:** User doing a site survey at a new address.
**Goal:** Navigate to an address that has no photos in SiteSnap yet.

1. User types a full address: `Operngasse 4, 1010 Wien`.
2. DB returns no matches (no images at this address).
3. Geocoder returns the address. Only Places section shown.
4. User clicks → map centers. Search Location Marker placed.

**Edge cases:**
- **EC-10a:** User types a partial address → geocoder returns multiple possibilities; user picks one.
- **EC-10b:** Address is in a country the org has never worked in → still shown but ranked below country-biased results if any exist.

## UC-11: Mobile on-site search

**Who:** Construction worker on a phone at a job site.
**Goal:** Quickly find an address on a small screen.

1. User taps the search bar. Virtual keyboard opens.
2. Types `ring` on small keyboard. Ghost completion: `straße 12, 1010 Wien`.
3. Taps Tab (or the ghost text area on mobile) → completes.
4. Results render. Touch targets are large enough for gloved fingers.

**Edge cases:**
- **EC-11a:** Viewport is very narrow → result rows truncate labels with ellipsis, not wrap.
- **EC-11b:** Keyboard covers half the screen → dropdown is scrollable above the keyboard.
- **EC-11c:** User is offline → offline cache returns known addresses; "Offline results only" badge shown.

## UC-12: Clear and start over

**Who:** Anyone who committed a search and wants to start fresh.
**Goal:** Remove the committed state and search for something else.

1. Search bar shows committed state: "Schleiergasse 18, 1100 Wien" with `×` button.
2. User clicks `×` → query clears, committed state resets, Search Location Marker removed, dropdown closes.
3. User can now type a new query.

**Edge cases:**
- **EC-12a:** User presses Backspace on empty committed input → same as clicking `×`.
- **EC-12b:** User edits the committed text directly → state transitions back to `typing`, committed state is cleared, new search fires.

## UC-13: Navigating results with keyboard only

**Who:** Power user or accessibility user.
**Goal:** Search, select, and commit without touching the mouse.

1. `Cmd/Ctrl+K` → focus.
2. Type query → results appear.
3. `ArrowDown` 3 times → third result highlighted.
4. `Enter` → committed.
5. `Escape` → dropdown closes.
6. `Escape` again → input blurs.

**Edge cases:**
- **EC-13a:** ArrowDown past last item → wraps to first item.
- **EC-13b:** ArrowUp from first item → wraps to last item.
- **EC-13c:** Enter with no results → nothing happens.
- **EC-13d:** Tab with ghost text + ArrowDown active → Tab takes priority (accepts ghost text), ArrowDown index resets.

## UC-14: Multiple similar addresses in different cities

**Who:** Org that works in both Vienna and Zürich.
**Goal:** Pick the right "Burgstraße" from results.

1. User types `burgstraße`.
2. DB section shows: "Burgstraße 7, 8001 Zürich — 23 photos" and "Burgstraße 3, 1010 Wien — 5 photos".
3. Geocoder section shows: "Burgstraße, Berlin" and "Burgstraße, Hamburg".
4. Geocoder results from Berlin/Hamburg are ranked lower (proximity decay away from org data centroid).
5. If viewport is zoomed into Vienna, Nominatim viewbox bias further suppresses Zürich and Berlin results.
6. User selects the correct one.

**Edge cases:**
- **EC-14a:** DB addresses dedup geocoder results → if geocoder also returns "Burgstraße, Zürich" within 30m of the DB result, geocoder row is hidden.
- **EC-14b:** Org has data in USA and Vienna → country restriction includes both `at,us`; results from France are still eliminated.

## UC-15: Search immediately after login (cold start)

**Who:** User who just logged in for the first time today.
**Goal:** Recents load, geo-context is available.

1. User logs in. Session starts.
2. In background: org country codes and data centroid are fetched and cached.
3. Recent searches are loaded from localStorage.
4. User clicks search bar → recents appear immediately (no network wait needed).
5. User types → DB queries run; geocoder queries include country bias from step 2.

**Edge cases:**
- **EC-15a:** Background geo-context hasn't loaded yet when user types → geocoder fires without country restriction; results are re-ranked once context arrives.
- **EC-15b:** Fresh org with zero images → no country codes, no centroid; geocoder fires unbiased.
- **EC-15c:** User logged out in another tab → background resolver stops; search still works with cached data.

## UC-16: "Did you mean?" suggestion

**Who:** User who made a typo in a street name.
**Goal:** Get guided to the correct address.

1. User types `denisgass 46`.
2. Primary search returns no exact matches.
3. Fallback fires with corrected variant `denisgasse 46`.
4. DB returns results for Denisgasse 46.
5. Above the results, a suggestion row appears: _"Did you mean **Denisgasse 46**?"_
6. User clicks suggestion → query replaces to `Denisgasse 46`, search reruns.

**Edge cases:**
- **EC-16a:** Strict matches exist → no "Did you mean?" shown (the user got what they wanted).
- **EC-16b:** Correction is ambiguous (multiple possible corrections) → show the highest-scoring one.
- **EC-16c:** The corrected result is from geocoder, not DB → still show the suggestion.

## UC-17: Concurrent search and filter

**Who:** User who has active filters and also uses search.
**Goal:** Filters and search coexist.

1. User has active filters: "Last 7 days" + "Project: Favoriten".
2. User searches `schleiergasse`.
3. Filter chips remain visible.
4. Search results are shown (search does not reset filters).
5. User commits a search result → distance reference point for distance filter is set from the committed location.

**Edge cases:**
- **EC-17a:** User navigates to image detail from search results and comes back → search context persists.
- **EC-17b:** User switches tabs (Photos → Groups) → search context persists.
- **EC-17c:** User explicitly clicks "Clear filters" → only filters clear, not the search commitment.

## UC-18: Long session with many unique searches

**Who:** Power user who searches all day.
**Goal:** Caches don't grow unbounded.

1. User searches 100+ unique addresses over a day.
2. GeocodingService forward/reverse caches grow.
3. At 200 entries, LRU eviction kicks in — oldest entries are purged.
4. Recent searches cap at 20 entries.
5. Ghost completion prefix trie is rebuilt when DB cache refreshes.

**Edge cases:**
- **EC-18a:** Evicted cache entry is re-searched → refetched from geocoder (5min TTL would have expired anyway).
- **EC-18b:** User searches the same 5 addresses repeatedly → cache keeps them warm; no redundant geocoder calls.
