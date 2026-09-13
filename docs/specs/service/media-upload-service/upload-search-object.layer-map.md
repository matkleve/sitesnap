# Upload Search Object — Layer packages

> **Parent:** [upload-search-object.md](./upload-search-object.md) · [address-resolution-model.md](./address-resolution-model.md)  
> **Examples:** [upload-search-object.layer-map.examples.md](./upload-search-object.layer-map.examples.md)  
> **Code:** `apps/web/src/app/core/location-path-parser/upload-search-object.layer-map.ts`

## Purpose

Preserve **competing path interpretations** before flat `UploadSearchObject` collapse. Users resolve **which address package** (folder segment path vs filename) applies; Photon runs only on the resolved flat SO.

## Explicit non-goals

- Geocode both conflicting packages and compare results — **forbidden**.
- Per-field trays (street tray, then house tray) — **forbidden** (impossible hybrids).
- Mutating administrative context when user picks a street-level package.

## `AddressLayerEntry`

| Field | Type | Notes |
| --- | --- | --- |
| `layerKey` | `string` | See [layerKey format](#layerkey-format) |
| `source` | `'folder' \| 'filename'` | |
| `parsed` | `StreetLevelParsed` | Subset of SO street-level fields |

### `StreetLevelParsed`

| Field | SO key |
| --- | --- |
| Street | `street` |
| House number | `houseNumber` |
| Stairwell | `staircase` |
| Top / Tür | `door` |

See [upload-search-object.unit-parsing.at.md](./upload-search-object.unit-parsing.at.md).

## layerKey format

| Source | `layerKey` | `source` |
| --- | --- | --- |
| Folder prefix through segment index `i` | Normalized `segments[0..i]` joined with `/`, lowercase, NFC, trimmed | `folder` |
| Filename parse | `__filename__` | `filename` |

**Building:** For each folder prefix `i`, parse `relativePath` = `segments[0..i]` + `/` + `fileName` with `buildSearchObjectFromRelativePath`, extract street-level fields into `parsed`. For `__filename__`, parse `fileName` only with shared geo context.

Only emit an entry when `parsed` has at least one non-null street-level field.

## Administrative vs street-level

| Domain | Fields | Resolution |
| --- | --- | --- |
| **Administrative** | `country`, `state`, `city`, `postcode` | `resolveAreaContext(relativePath, fileName, geo)` — full path parse + `expandPostcodeOnSearchObject`; **never** changed by package tray |
| **Street-level** | `street`, `houseNumber`, `staircase`, `door` | Package merge or tray (below) |

**Invariant:** Street-level package choice does not mutate administrative context.

## Package conflict detection

Two entries **conflict** iff both contribute at least one street-level value and there exists field `f` where `normalizeValue(a[f]) !== normalizeValue(b[f])`.

`normalizeValue`: trim, lowercase, **NFKD**, strip combining marks, collapse whitespace — same as `buildGroupingKey` / `normalizeKeyPart` in code (e.g. `Straße` ≡ `strasse`). Path `layerKey` segments use NFC only.

**Tray:** One option per **conflicting** entry. Label via `formatPackageLabel(entry)` → i18n `{packageLabel}` (e.g. `Folder: Neustiftgasse 11`, `Filename: Thaliastraße 7`).

**No tray:** All overlapping fields equal; extras only on one side → [merge rules](#merge-rules).

## Merge rules

| Condition | Action |
| --- | --- |
| Different value on overlapping field | Package conflict → tray |
| Same value | Merge |
| Missing on one package only | Enrich |

## `resolveSOWithChosenLayer`

| Path | Street-level | Administrative |
| --- | --- | --- |
| After tray (**Option A**) | Only `parsed` from `chosenLayerKey`; absent keys → `null` | `resolveAreaContext` |
| Auto-merge (no tray) | `mergeLayersWithoutConflict` | `resolveAreaContext` |

Emit `groupingKey` via existing `buildGroupingKey` on merged flat fields.

## Orchestrator status

| `status` | Photon allowed |
| --- | --- |
| `needsLayerResolution` | **NO** |
| `needsGeocode` | YES (after layer resolution) |

`classifyBatch` MUST NOT set `needsGeocode` while `detectPackageConflicts(layers).length > 0`.

## Tray registration

| Field | Value |
| --- | --- |
| `disambiguationKind` | `layer_package` |
| `queryKey` | `layer\|{normalizedFolderPath}\|{conflictSignature}` |
| `jobIds` | All batch jobs sharing same `layerConflictQueryKey` |

`enqueueItem` for `layer_package` runs at end of `classifyBatch` (before Photon). Geocode trays still follow [address-resolution-model.md](./address-resolution-model.md) tray enqueue contract.

## Implementation map

| Symbol | File |
| --- | --- |
| `buildAddressLayers` | `upload-search-object.layer-map.ts` |
| `detectPackageConflicts` | same |
| `mergeLayersWithoutConflict` | same |
| `resolveAreaContext` | same |
| `resolveSOWithChosenLayer` | same |
| `buildFlatSearchObjectFromLayers` | same |
| `buildLayerConflictQueryKey` | same |
| `registerLayerPackageGroup` | `upload-location-resolution.service.ts` |
| Orchestrator branch | `upload-address-resolution.orchestrator.ts` |

## Acceptance criteria

- [x] Package conflict tray appears before any `runGeocodeForGroup` for that job group — `needsLayerResolution` groups are held via `holdLayerPackagePreResolve` (`upload-location-pre-resolve-orchestrator.service.ts`) before `ensureGeocodedGroup` ever runs.
- [x] Choosing a package sets flat SO street-level fields from that package only (Option A) — `resolveSOWithChosenLayer`; covered by EX-03.
- [x] Administrative `city` unchanged when filename package selected (EX-04) — `resolveAreaContext` always derives from `relativePath`, independent of `chosenLayerKey`; covered by EX-04.
- [x] Enrich door when street/house agree (EX-02) — `mergeLayersWithoutConflict`; covered by EX-02.
- [x] Vitest covers EX-01…EX-08 in examples doc — EX-05 added in `upload-search-object.layer-map.spec.ts` ("EX-05: locality-only intermediate segment is excluded from conflict").
