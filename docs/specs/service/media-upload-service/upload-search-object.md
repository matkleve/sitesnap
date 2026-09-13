# Upload search object (SO)

> **Parent:** [address-resolution-model.md](./address-resolution-model.md) · [upload-address-resolution-pipeline.md](./upload-address-resolution-pipeline.md)

All **field names are English** (internal model). **Values** use locale-appropriate place names (e.g. `Wien`, `AT`). UI copy is translated separately via i18n.

## Normative index

| Topic | Spec |
| --- | --- |
| Fields, tokens, keys | **This file** |
| Layer packages (folder vs filename) | [upload-search-object.layer-map.md](./upload-search-object.layer-map.md) |
| Evidence, derivation, flat view | [upload-search-object.evidence-model.md](./upload-search-object.evidence-model.md) |
| Country derived from the place | [upload-search-object.country-derivation.md](./upload-search-object.country-derivation.md) |
| AT unit / slash / Tür / Top | [upload-search-object.unit-parsing.at.md](./upload-search-object.unit-parsing.at.md) |
| Worked layer examples | [upload-search-object.layer-map.examples.md](./upload-search-object.layer-map.examples.md) |
| Pipeline keys + trays | [upload-address-resolution-pipeline.md](./upload-address-resolution-pipeline.md) |
| Legacy narrative parser | [location-path-parser.md](../location-path-parser/location-path-parser.md) — **non-normative**; use SO specs above |

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `country` | string \| null | ISO country code (e.g. `AT`) |
| `countryProvenance` | `'parsed' \| 'derived' \| null` | `parsed` = a country token in the path; `derived` = inferred from an exact place match ([country derivation](./upload-search-object.country-derivation.md)) |
| `state` | string \| null | First-level region (e.g. AT federal state) |
| `postcode` | string \| null | Format depends on `country` — not classified without country |
| `city` | string \| null | Municipality / city |
| `street` | string \| null | Street name (joined fragments) |
| `houseNumber` | string \| null | House number |
| `staircase` | string \| null | Stiege / stairwell (`locations.staircase`) |
| `door` | string \| null | Top / Tür / unit door (`locations.door`) |
| `project` | string \| null | Project prefix token |
| `sources` | `UploadAddressSourceEntry[]` | Provenance per field write |
| `sourceDeviations` | deviation[] | Folder vs filename conflict log |
| `postcodeCandidates` | string[] | Multiple cities for one postcode |
| `uncertainFields` | string[] | Field names with 0.90–0.97 confidence |
| `groupingKey` | string | Batch geocode dedup key (building-level; see [Keys philosophy](#keys-philosophy)) |
| `relativePath` | string | Immutable job path |
| `fileName` | string | Leaf file name |
| `areaEvidence` | `Partial<Record<AreaFieldKey, FieldLevelEntry[]>>` | Area values per folder level, each marked `path` or `derived` (see [Area evidence](#area-evidence)) |
| `areaConflicts` | `AreaConflict[]` | Area fields with a level or gazetteer mismatch |

## Area evidence

**Area** fields (`country`, `state`, `city`, `postcode`) — the places that *contain* an address — **MUST** record every write with its folder level and its [origin](./upload-search-object.evidence-model.md) in `areaEvidence`.

| Rule | Requirement |
| --- | --- |
| Level index | `0` = filename; `1` = direct parent folder; higher = ancestors (root = highest) |
| Filename gate | A **numeric** level-`0` entry (i.e. a postcode) is written **only if** the same filename yields a street-level token at confidence ≥ 0.9. `IMG_1274.jpg` contributes no `postcode`; `1090 Mühlenstraße 12.jpg` does. Named tokens are never gated — a camera writes `IMG_1274.jpg`, never `Graz.jpg`. |
| Flat fields | **MUST** collapse to the entry with the **lowest** level index (most specific folder) for `groupingKey` |
| Conflict detect order | PLZ→city lookup (no SO mutation) → AT `GemeindeRecord.b` city∈state → Salzburg (`state` name === `city` name) → same-field value compare |
| Cross-field | When `city` and `state` are semantically incompatible (e.g. `Wien` + `Innsbruck`), **MUST** populate `areaConflicts` |
| Tray | Non-empty `areaConflicts` → `needsAreaResolution` before geocode |
| Address fields | Layer packages remain normative for `street` / `houseNumber` / units — **not** in `areaEvidence` |

Types: `apps/web/src/app/core/upload/address-resolution/upload-area-evidence.types.ts`.

## Keys philosophy

Folder paths encode **text addresses**, not GPS per Tür/Stiege. Geocoders return one building point per query. Therefore keys split by purpose:

| Key | `staircase` / `door` | GPS in key | Purpose |
| --- | --- | --- | --- |
| **`groupingKey`** | **Excluded** | No | One Photon call per building (`country` … `houseNumber`); batch upload dedup |
| **`address_dedupe_key`** (DB) | **Included** (`coalesce` to empty) | Optional lat/lng in hash | Org-unique `public.locations` row |
| **`layerConflictQueryKey`** | N/A | No | Package tray merge |

Units are still parsed into the SO and persisted via `p_staircase` / `p_door` on resolve. They affect display, sort keys, and DB uniqueness — not default batch geocode grouping.

### Photon multi-hit gate

When SO has `staircase` and/or `door`, Photon returns **≥2** candidates, and pairwise max distance between candidates **> `unitGeocodeSplitMinMeters`** ([upload-location-config.md](./upload-location-config.md)), use existing ambiguous / city_step trays to let the user pick a coordinate — **do not** add units to the forward-geocode request.

When Photon returns **one** hit: keep a single `groupingKey`; store units on SO only.

See [upload-search-object.unit-parsing.at.md](./upload-search-object.unit-parsing.at.md) and [search-tuning.distance-radii-contract.md](../search/search-tuning.distance-radii-contract.md).

## Token classification order

Per [upload-search-object.unit-parsing.at.md](./upload-search-object.unit-parsing.at.md): apply AT slash expansion on a segment **before** tokenization when `country === 'AT'`.

Per path segment, split tokens with `/[\s\-\_\.\,]+/`, then **two passes**:

**Pass 1 — non-numeric tokens (in path order):**

1. Project prefix `^projekt[:\s]/i`  
2. Door `^(tür\|top)/i` → `door`  
3. Staircase `^(stiege?\|stg)/i` → `staircase` (**not** `top`)  
4. **Country** — alias list (`COUNTRY_NAMES`)  
5. State / city — **exact** normalized name/alias match first (city registry, then AT gazetteers); an exact hit with no country yet **derives** one, see [country derivation](./upload-search-object.country-derivation.md). Fuse only as fallback, and a fuzzy hit whose length differs from the token by more than `max(2, ⌈len × 0.25⌉)` is rejected (**AT gazetteer Fuse only when `country === 'AT'`**)  
6. Remaining text → `street` fragments  

**Pass 2 — numeric tokens last** (`^\d+[a-zA-Z]?$`):

1. **Postcode** — only if `country` is set (from pass 1 or an earlier path segment), the token matches that country's pattern, and — in a filename segment — the [filename gate](#area-evidence) is open  
2. **House number** — if country known: `^\d{1,4}[a-zA-Z]?$`; if country unknown: only `^\d{1,3}[a-zA-Z]?$` (so `1090` is not mistaken for a house number)  

Earlier folder segments run before later ones, so `AT/.../1090` sets `country` before pass 2 on `1090`.

**Out of scope (for now):** inferring postcode from map viewport/radius during upload — see pipeline doc note on spatial disambiguation.

## Country-specific data (not structure)

| Asset | Scope |
| --- | --- |
| `at-bundeslaender.json` | AT states (Fuse when `country === 'AT'`) |
| `at-gemeinden-bev.json` | AT municipalities |
| `at-plz.json` | AT postcode → city (expand step) |

Other countries: path parsing and geocoding use country code; gazetteer Fuse is skipped until data exists.

## Conflict rule

**Layer packages (normative):** [upload-search-object.layer-map.md](./upload-search-object.layer-map.md) — competing path interpretations resolve via `layer_package` tray **before** geocode.

**Legacy flat builder:** filename segment overrides folder for the same field; log deviation in `sourceDeviations` (superseded at runtime once layer map is active in `classifyBatch`).

## Completeness (geocode branches)

`houseNumber` is **never** a gate criterion — it only improves geocode precision when `street` is present.

| Branch | Gate | Geocode | Tray |
| --- | --- | --- | --- |
| **A** | `street` AND (`city` OR `postcode`) | structured-forward | Step 3 if multiple hits |
| **B** | `street`, no locality, project centroid | structured-forward-bias | Step 3 if multiple; 0 hits → Branch C (Step 1A) |
| **C** | `street`, no locality, no centroid | `street` + `country=AT` (Photon first) | **5b** numbered discriminating field; **5c** house; 0 hits → 1A text only |

See [address-resolution-model.md § Branch C](./address-resolution-model.md#branch-c--street-only-countryat).
| **Below street** | area fields only | none (area centroid stored) | none |

Legacy helper `isSearchObjectComplete()` remains true only for Branch A.

Implementation: [`upload-search-object.completeness.helpers.ts`](../../../../apps/web/src/app/core/location-path-parser/upload-search-object.completeness.helpers.ts).

## Confidence thresholds

| Score | Action |
| --- | --- |
| ≥ 0.98 | Write field |
| 0.90–0.97 | Write + `uncertainFields` |
| < 0.90 | Omit field |

Fuse: `score = 1 - fuseResult.score` (0 = perfect match). An exact name/alias match scores `1`
without consulting Fuse. The length bound in pass 1 step 5 exists because a token **absent** from the
gazetteer otherwise substitutes a longer entry containing it at a passing score — `Wien` →
`Schottwien` at 0.992. A gazetteer gap must fail visibly, not resolve to a neighbour.
