# Upload resolver tray

> **Parent:** [upload-shell.md](./upload-shell.md)  
> **Service:** [upload-location-resolution.md](../../service/media-upload-service/upload-location-resolution.md)

## What it is

`app-upload-resolver-tray` — active address-choice UI inside `.upload-shell__dock` (layout-only column; tray owns its own frosted card). Renders below the panel when both are visible; tray-only when the panel is closed.

**One generic tray component** — scenarios (city, address, source, layer package) differ by `questionKey` and `options[]` from producers, not separate components.

**Active layout (Cursor Questions–inspired):** section label **Address resolver**, optional carousel (`‹` **1/4** `›` when **≥2 dialogue units** in bundle), **compact semibold question** (`p`, `--font-size-md` ~1rem — see [question copy contract](./upload-resolver-tray.question-copy.md)), folder path (tooltip only; source tray may show parsed address subtitle), numbered answers, **affected-media chip** (`{count} media` + dropdown), footer **Skip** + compact primary (**Next** / **Save** on last unit).

## Affected-media chip

- Neutral `app-chip` on a button; label `{count} media`.
- Click → `app-dropdown-shell` list of upload job file names (scroll when long).
- Row action **Ask later** → `isolateJobFromGroup` (queues a single-job tray card in the carousel **without** switching the active card).
- Folder path uses `title` / `aria-label`, not a visible “Folder” prefix.

**Question copy (normative):** [upload-resolver-tray.question-copy.md](./upload-resolver-tray.question-copy.md) — city vs address vs door vs source; door-number grid/input is planned, not MVP.

## Visual modes

| Mode | `data-state` | When |
| --- | --- | --- |
| `active` | `active` | `hasActivePresentation()` |
| `passive` | `passive` | `!panelOpen && hasPresentationBacklog()` (inbox, collecting, or pending bundles) |
| `hidden` | (unmounted branch) | `embeddedInPane` OR idle with no backlog |

`passiveStatusLine` comes from `UploadPanelSignalsService` (G12), not the resolution service.

## Mounting

- **Host:** `app-upload-shell` → `.upload-shell__dock` (see [upload-shell.md](./upload-shell.md)).
- **Layout:** `authenticated-app-layout.component.html` mounts one shell on **every authenticated route** (map, media, projects, …).
- **Map preview:** `(previewLocation)` wired in `upload-shell` to pan/zoom the map when the user hovers or focuses an option.
- **`embeddedInPane`:** when `true`, tray returns `trayMode: hidden` (workspace-embedded panel must not duplicate the shell tray).

## Data pipeline (read / write)

Tray is a **view** over the [upload resolver tray orchestrator](../../service/media-upload-service/upload-resolver-tray-orchestrator.md); it does not call geocoders or Supabase.

| Direction | Source / sink | Data |
| --- | --- | --- |
| **Read** | `UploadResolverTrayOrchestratorService` | `activeItem`, `activeItems`, `itemStatuses`, `hasActivePresentation` |
| **Read** | `UploadManagerService.jobs()` | File names for `affectedMedia` chip rows |
| **Read** | `UploadPanelSignalsService.passiveStatusLine` | Passive dock line when panel closed |
| **Write** | `orchestrator.resolveActiveItem` / `skipActiveItem` | Per-item Continue / Skip → `itemResolved$` |
| **Write** | `UploadLocationTrayProducerAdapter` (subscriber) | Applies answers to `UploadLocationResolutionService` / `UploadManagerService` |

**Carousel:** index within the **current presentation bundle** only (`1A/4`, `2/4`), not across all open disambiguation groups in the batch.

**Upstream (before tray):** `UploadNewPipelineService` → `runPreUploadLocationResolve` → geocode / orchestrator → `registerDisambiguationGroup`. See [upload-address-resolution-pipeline.md](../../service/media-upload-service/upload-address-resolution-pipeline.md#tray-contract).

**Debug:** `localStorage.setItem('feldpost:debug:upload-address', '1')` → `[upload-placement] P1–P6` and `[upload-address:*]` (see pipeline doc).

## Carousel

- Shown when `activeItems().length > 1` in the current bundle: `‹` **{current}/{total}** `›` (optional **1A** / **1B** sub-label).
- **Production:** `goToAdjacentItem` changes index within the bundle only.
- **Mock (`mockResolverTray`):** `presentBundleImmediately` with fixture items — city options (1A), dependent house step (1B), source, geocode.

## Ownership matrix

| Behavior | Geometry | State | Visual |
| --- | --- | --- | --- |
| Passive line | `:host` | `data-state=passive` | `.upload-resolver-tray__passive` |
| Active card | `.upload-resolver-tray` | `data-state=active` | `.upload-resolver-tray` |
| Choice row | `.upload-resolver-tray__choice` | `__choice--selected` | number badge (1–9) + label; keyboard digits select, Enter continues, Escape skips; interaction emphasis on row |
| Score micro-bar | `.upload-resolver-tray__choice-score-col` | `data-score-band` (`low` / `okay` / `strong`) | centered percent + 3px track (`--score-bar-width` 1.5rem); fill width = score |
| Footer actions | `.upload-resolver-tray__footer` | — | skip text + continue primary |

## Score micro-bar

Decorative confidence readout under each option’s percent (not announced separately; score stays in `optionAriaLabel`).

| Band | Score range | Fill color |
| --- | --- | --- |
| `low` | &lt; 0.70 | `--score-ink-neutral` on column (`foreground`/`background` mix, achromatic) |
| `okay` | 0.70 – 0.979 | `--primary` |
| `strong` | ≥ 0.98 | `--chart-1` (high-trust / near-certain) |

Fill width: `calc(var(--score-fill) * 1%)` where `--score-fill` is 0–100 from normalized candidate score. Column: percent centered above track; hosts `--score-track` (light neutral) and `--score-ink-neutral` (percent + low fill) — **not** `--muted-foreground` / `--border` (cool hue). Track: `height: 3px`, `width: 1.5rem` (`--score-bar-width`), `border-radius: var(--radius-full)`.

## Interaction emphasis

Choice rows follow [`state-visuals.md`](../../../design/state-visuals.md) § Interaction emphasis and [`interaction-emphasis-ink-contract.md`](../../system/interaction-emphasis-ink-contract.md):

| State | Ink | Background |
| ----- | --- | ------------ |
| Idle | `--foreground` | transparent |
| Hover / focus (unselected) | `--brand-gold` on host; children inherit | `emphasis.hover` or matching gold wash + ink |
| Selected (`__choice--selected`) | `--interaction-selected-ink` | selected-ink 10% mix |
| Selected + hover | `--brand-gold` (same as hover) | `emphasis.hover` |

**Test oracle:** Selected answer is blue at rest; hovering it turns **gold**; unselected rows gold on hover.

## Inputs / outputs

- **Inputs:** `panelOpen`, `embeddedInPane` (false on map)
- **Outputs:** `candidateSelected`, `groupChanged`, `deferRequested`, `previewLocation`

## Lane contract (OD-2)

Jobs in `awaiting_disambiguation` stay in **Queue** with label “Choose address”. Tray is the primary resolution path; row `candidate_select` is secondary.

## `disambiguationKind` (tray copy and layout)

Each `disambiguationKind` maps to a **contradiction class** in the [contradiction-resolution-model.md](../../service/media-upload-service/contradiction-resolution-model.md#contradiction-taxonomy). The tray is a **contradiction resolver** — see that document for the CSP philosophy, propagation lifecycle, and resolution scope rules.

| Kind | Class | When | UI |
| --- | --- | --- | --- |
| `geocode` (default) | A1 | Multiple forward-geocode hits (Step 3) | Question + options per [question-copy](./upload-resolver-tray.question-copy.md) |
| `city_step` | A1 | Branch C / B→C fallback (Step 1A) | City input + Continue |
| `house_step` | A2 | Step 1B after city confirmed | House number list + “No number needed” |
| `source` | C1 | Text coords vs EXIF metadata > `sourceAgreementRadiusMeters` | `upload.resolver.question.source` + **four** placement options (folder address / photo / both / set later) |
| `layer_package` | C2 | Competing folder vs filename street packages | `upload.resolver.question.layerPackage` — package labels per layer |
| `admin_level_conflict` | C3/C4 | Area fields (`country`/`state`/`postcode`/`city`) disagree across folder levels or AT gazetteer; cascading after folder-to-folder sibling detection | `upload.resolver.question.adminLevelConflict` — per-field `Level N: {value}` options |
| `containment_check` | V1 | Post-resolution: resolved street not found in resolved city+postcode via Photon probe | Yes/No + text input — see [contradiction model § G3](../../service/media-upload-service/contradiction-resolution-model.md#post-resolution-validation-gate-gap-g3) |

**Deferred (not in `disambiguationKind` union):** C5 `context_distance` tray — distance filter only; Prompt B confirm UI never built. See [contradiction model deferred backlog](../../service/media-upload-service/contradiction-resolution-model.md#deferred-backlog-not-in-active-acceptance-criteria).

## Dev QA (local only)

`upload-dev-flags.ts` (defaults **false** in repo; set `true` locally for QA):

- `mockResolverTray` — three static groups in `upload-resolver-tray.mock.ts`; tray stays **active** with carousel; Skip/Continue advance cards without touching upload jobs.
- `dockAlwaysVisible` — passive dock line when idle (no real disambiguation).

## MVP scope (OD-7)

Pre-upload gate only. No tray for `phase === 'complete'` or post-upload correction.

## Acceptance criteria

- [x] Tray mounted inside `app-upload-shell` on all authenticated routes (not a map-only duplicate)
- [x] Active mode: numbered choices (1–9), score micro-bar, carousel when multiple groups, Skip + Continue footer
- [x] Affected-media chip: dropdown file list, Ask later without carousel jump; denominator updates (e.g. 1/3 → 1/4)
- [x] `source` kind shows two candidates without city collapse
- [x] Continue applies candidate to whole group via `applyCandidateToGroup` and re-queues jobs
- [ ] Last dialogue unit in bundle shows **Save** (not Next when alone)
- [ ] Map preview on option hover (before Continue)
- [ ] Continue disabled until all `activeItem.jobIds` pass tray prepare gate (location-routing supplement)
- [ ] Late source-conflict jobs replay stored `selectedCandidateId`
- [ ] Dock visible when `hasPresentationBacklog()` even if panel closed
- [ ] HEIC conversion may appear in queue before first tray when workers start early (concurrency 3) — expected
