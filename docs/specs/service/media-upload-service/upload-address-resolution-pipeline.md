# Upload address resolution pipeline

> **Parent:** [address-resolution-model.md](./address-resolution-model.md) · [upload-manager-pipeline.md](./upload-manager-pipeline.md)  
> **Children:** [upload-search-object.md](./upload-search-object.md), [upload-address-resolution.local-geo.md](./upload-address-resolution.local-geo.md), [upload-address-resolution.phases.md](./upload-address-resolution.phases.md)  
> **Resolution service:** [upload-location-resolution.md](./upload-location-resolution.md)  
> **Tray:** [../../component/upload/upload-resolver-tray.md](../../component/upload/upload-resolver-tray.md)

## What it is

Pre-upload pipeline: folder/filename paths → **layer packages** → flat **Search Object (SO)** → dedup by `grouping_key` → local PLZ → read-only DB lookup → completeness gate → Photon/Nominatim structured geocode → tray or Nachbearbeitung.

Layer packages: [upload-search-object.layer-map.md](./upload-search-object.layer-map.md).

## Keys (do not conflate)

| Key | Includes units? | Purpose |
| --- | --- | --- |
| `grouping_key` | **No** (`staircase` / `door` excluded) | Batch dedup, one forward-geocode per building; tray `queryKey` for geocode/source |
| `address_dedupe_key` | **Yes** | SHA256 from `compute_location_address_dedupe_key` — `public.locations` uniqueness |

Rationale: path folders do not provide independent GPS per Tür/Stiege; Photon resolves the building. Units are on the SO and DB row ([upload-search-object.md § Keys philosophy](./upload-search-object.md#keys-philosophy)). Single Photon hit → one `grouping_key` even when SO has units.

## Tray contract

| Kind | `jobIds` merge key |
| --- | --- |
| `layer_package` | `layerConflictQueryKey` — all jobs in batch with same signature |
| `admin_level_conflict` | `areaConflictQueryKey` — `{field}\|{sortedValues}` signature per conflict set |
| Geocode / source | `grouping_key` (or `source\|{groupingKey}` for source) |

`registerDisambiguationGroup` merges `jobIds` on repeated registration with the same `queryKey`.

| Stage | Owner | Effect |
| --- | --- | --- |
| Batch intake | `UploadAddressResolutionOrchestrator.classifyBatch` | Layer packages → flat SO; cache `needsAreaResolution` / `needsLayerResolution` / `needsGeocode` / `resolved` / `ambiguous` / `partial` |
| Per job | `runPreUploadLocationResolve` → `applyPreResolveFromOrchestrator` or `resolveJobTitleAddress` | Geocode + `classifySearchHits`; ambiguous → `registerDisambiguationGroup` |
| UI | `app-upload-resolver-tray` | Reads `disambiguationGroups`, `activeGroup`, `UploadManagerService.jobs`; writes via `selectAddressCandidate`, `deferGroup`, `isolateJobFromGroup` |

Tray does **not** call geocoders. Placement trace: `[upload-placement] P1–P6` in `upload-address-resolution.debug.ts` (enable via `feldpost:debug:upload-address`). Detail: [upload-resolver-tray.md](../../component/upload/upload-resolver-tray.md#data-pipeline-read--write).

## Nachbearbeitung

Completeness fail or 0/low-confidence geocode: no tray; job → `missing_data`; after save `media_items.location_status = 'partial'` when text/path exists without coords.

## Debug logging (browser)

Enable before uploading a folder:

```js
localStorage.setItem('feldpost:debug:upload-address', '1')
```

Filter DevTools console by `[upload-address:` — logs Search Object fill, DB RPC, geocode request/response summaries, group status transitions.

Disable: `localStorage.removeItem('feldpost:debug:upload-address')`

**Geocode upstream (Photon vs Nominatim):** chosen in the `geocode` edge function. Local Supabase sets `GEOCODER_FORWARD_URL` in `supabase/config.toml` (self-hosted Photon, not Komoot public cloud). Edge logs `[geocode] action=… upstream=photon|nominatim` and sets response header `X-Feldpost-Geocoder-Upstream` (visible in network tab if your client exposes it).

## Acceptance criteria

- [x] Folder and single-file uploads use the same orchestrator entry (`classifyBatch` on submit)
- [x] One structured geocode per `grouping_key` per batch (`ensureGeocodedGroup` inflight dedupe)
- [x] Tray shows correct file count per group (`jobIds` on group + media chip)
- [x] EXIF and `relative_path` preserved on jobs and DB insert
