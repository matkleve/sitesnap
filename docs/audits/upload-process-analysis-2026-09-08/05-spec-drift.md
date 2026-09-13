# 05 — Spec ↔ code drift (Phase 5)

**Commit:** `8e4b1e09` · **Scope:** the 31 upload spec files under `docs/specs/**/*upload*.md` plus `docs/specs/service/media-upload-service/**`, and the two non-normative playbooks named in plan § 2.4.

**Method.** Two passes. (1) A **mechanical** pass: every code-shaped path referenced in those files was extracted and tested for existence on disk (throwaway script, scratchpad only). (2) A **claim** pass over the parent specs' File Maps, State tables, FSM tables and Acceptance Criteria against the code read in Phases 1–4.

**Verdict column** per plan § 4 Phase 5: *spec wrong* → a documentation task; *code wrong* → a bug; *both* → the contract needs re-deciding. Nothing is fixed here.

---

## 1. Executive shape of the drift

| Class | Count | Verdict |
| --- | --- | --- |
| Broken code paths in specs and playbooks | **60** across 9 files | spec wrong |
| Ticked acceptance criteria that the code contradicts | **2** | code wrong |
| Spec-vs-spec contradiction | **1** | both |
| Type/union tables out of date | **4** | spec wrong |
| Broken intra-doc links | 1 | spec wrong |
| Structural / governance gaps | 4 | mixed |

The dominant failure is mechanical and cheap to fix: the `manager/` `support/` `pipelines/` `location/` reorganisation moved 12 services and **no spec File Map was updated**. Plan § 6 lead 1 is **confirmed and much larger than stated** — it is not only `upload-manager-pipeline.md`.

---

## 2. Broken code paths (mechanical pass)

Every row below was verified with `existsSync`. "Reality" is the resolved current location.

### 2.1 `docs/specs/service/media-upload-service/upload-manager-pipeline.md` § File Map (lines 128–149)

| Priority | Section | Claim | Reality (`path:line`) | Verdict | One-line fix |
| --- | --- | --- | --- | --- | --- |
| high | File Map | `core/upload/upload-new-pipeline.service.ts` (`:128`) | `apps/web/src/app/core/upload/pipelines/new/upload-new-pipeline.service.ts:62` | spec wrong | repoint |
| high | File Map | `core/upload/folder-scan.service.ts` (`:129`) | `apps/web/src/app/core/folder-scan/folder-scan.service.ts` | spec wrong | repoint (different module, not just a subfolder) |
| high | File Map | `core/filename-parser.service.ts` (`:130`) | `apps/web/src/app/core/filename-parser/filename-parser.service.ts` | spec wrong | repoint |
| high | File Map | `core/location-path-parser.service.ts` (`:131`) | `apps/web/src/app/core/location-path-parser/location-path-parser.service.ts` | spec wrong | repoint |
| high | File Map | `core/geocoding.service.ts` (`:132`) | `apps/web/src/app/core/geocoding/geocoding.service.ts` | spec wrong | repoint |
| high | File Map | `core/upload/upload-replace-pipeline.service.ts` (`:133`) | `apps/web/src/app/core/upload/pipelines/replace/upload-replace-pipeline.service.ts:34` | spec wrong | repoint |
| high | File Map | `core/upload/upload-attach-pipeline.service.ts` (`:134`) | `apps/web/src/app/core/upload/pipelines/attach/upload-attach-pipeline.service.ts:53` | spec wrong | repoint |
| high | File Map | `core/upload/upload-queue.service.ts` (`:135`) | `apps/web/src/app/core/upload/support/upload-queue.service.ts:13` | spec wrong | repoint |
| high | File Map | `core/upload/upload-job-state.service.ts` (`:136`) | `apps/web/src/app/core/upload/support/upload-job-state.service.ts:104` | spec wrong | repoint |
| high | File Map | `core/upload/upload-conflict.service.ts` (`:137`) | `apps/web/src/app/core/upload/support/upload-conflict.service.ts:29` | spec wrong | repoint |
| high | File Map | `core/upload/upload-enrichment.service.ts` (`:138`) | `apps/web/src/app/core/upload/support/upload-enrichment.service.ts:35` | spec wrong | repoint |
| high | File Map | `core/upload/upload-storage.service.ts` (`:139`) | `apps/web/src/app/core/upload/support/upload-storage.service.ts:27` | spec wrong | repoint |
| medium | File Map | `core/filename-parser/date-patterns.const.ts` (`:144`) | **no such file anywhere in `apps/web/src`** | spec wrong | delete the row or name the surviving file |
| medium | File Map | `core/filename-parser/metadata-keywords.const.ts` (`:145`) | **no such file** | spec wrong | as above |
| medium | File Map | `core/location-path-parser.util.ts` (`:146`) | `apps/web/src/app/core/location-path-parser/location-path-parser.util.ts` | spec wrong | repoint |
| medium | File Map | `core/filename-parser.util.ts` (`:147`) | **no such file** | spec wrong | delete or repoint |
| medium | File Map | `core/content-hash.util.ts` (`:149`) | `apps/web/src/app/core/upload/support/content-hash.util.ts:116` | spec wrong | repoint |

**17 of 17 File Map code rows are broken.** Not one path in that table resolves.

### 2.2 `docs/specs/service/media-upload-service/upload-manager.md` § File Map (lines 161–176)

Thirteen broken rows, same reorganisation: `core/upload/upload-job-state.service.ts` (`:161`), `…/upload-batch.service.ts` (`:162`), `…/upload-queue.service.ts` (`:163`), `…/upload-new-pipeline.service.ts` (`:164`), `…/upload-replace-pipeline.service.ts` (`:165`), `…/upload-attach-pipeline.service.ts` (`:166`), `…/upload-conflict.service.ts` (`:167`), `…/upload-enrichment.service.ts` (`:168`), `…/upload-storage.service.ts` (`:169`), `…/upload-notification.service.ts` (`:170`), `core/content-hash.util.ts` (`:171`), `core/geocoding.service.ts` (`:173`), `features/upload/upload-panel.component.ts` (`:176` → actual `apps/web/src/app/features/upload/upload-panel/upload-panel.component.ts:1`).

The § Pipeline Service Coverage Addendum (C-01) table repeats four of the same broken paths. **Verdict: spec wrong, priority high** — this is the parent contract's index, and it points nowhere.

Only two File Map rows in this file still resolve: `core/upload/upload-manager.service.ts` and `core/upload/upload-manager.types.ts`.

### 2.3 `docs/specs/component/upload/upload-panel.feedback-triage.md` (lines 45–57)

**13 broken paths in 13 lines** — the densest concentration in the repository. It predates *two* reorganisations (services into `core/<module>/`, and the panel into `features/upload/upload-panel/`):

`core/filename-parser.service.ts`, `core/upload/upload-new-prepare-route.util.ts` (actual `core/upload/pipelines/new/upload-new-prepare-route.util.ts`), `core/folder-scan.service.ts`, `features/upload/upload-panel.component.ts`, `core/supabase.service.ts` (actual `core/supabase/supabase.service.ts`), `features/upload/upload-panel-lane-handlers.service.ts` (**no such file** — the real one is `features/upload/upload-panel/upload-panel-lane-handlers.ts`, no `.service`), `features/upload/upload-panel.component.html`, `features/upload/upload-panel-item.component.ts`, `features/upload/upload-panel-item.component.html`, `features/upload/upload-panel.component.scss`, `features/map/map-shell/map-shell.component.ts` (actual `features/map/map-shell/component/map-shell.component.ts`), `features/upload/upload-panel-item.component.scss`, `shared/segmented-switch/segmented-switch.component.scss`.

### 2.4 Other spec files

| Priority | Spec path | Line | Claim | Reality | Verdict |
| --- | --- | --- | --- | --- | --- |
| high | `docs/specs/component/upload/upload-button-zone.md` | whole file (128 lines) | documents an `UploadButtonZone` component; `:27` cites `apps/web/src/app/features/map/map-shell/_map-shell-upload.scss` | **neither the component nor the SCSS file exists.** `find apps/web/src -iname "*button-zone*"` → 0 hits. The spec is referenced as a live wiring target from `upload-manager.md:241` ("`batchProgress$` → `UploadButtonZone`") | **spec wrong** — a contract for code that is not in the tree | archive the spec, or record it as a planned component |
| medium | `docs/specs/component/media/media-item-upload-overlay.md` | 29, 147, 148 | `apps/web/src/app/features/media/media-item-upload-overlay.component.{ts,html,scss}` | `apps/web/src/app/shared/media-item/media-item-upload-overlay.component.ts` (moved `features/media` → `shared/media-item`) | spec wrong |
| medium | `docs/specs/service/media-upload-service/upload-location-config.md` | 13, 55, 104 | `core/upload/upload-location-config.service.ts`, `…/upload-location-config.ts` | `apps/web/src/app/core/upload/location/upload-location-config.service.ts`, `…/location/upload-location-config.ts` | spec wrong |
| medium | `docs/specs/service/media-upload-service/upload-manager-pipeline.data.md` | 231 | `core/content-hash.util.ts` | `apps/web/src/app/core/upload/support/content-hash.util.ts` | spec wrong |
| low | `docs/specs/component/upload/upload-panel.md` | 265 | `features/map/map-shell/map-shell.component.ts` | `…/map-shell/component/map-shell.component.ts` | spec wrong |
| **high** | `docs/specs/service/media-upload-service/adapters/upload-project-gps-reference.adapter.md` | 41 | `apps/web/src/app/core/upload/adapters/upload-project-gps-reference.adapter.ts` | **does not exist.** `core/upload/adapters/` holds `upload-location-lookup.adapter.ts` and `upload-project-locations.adapter.ts` | consistent with `routing.md` § Phase 5 ("implement … only after adapter ships") — **spec is ahead of code by design**, not stale. Recorded so no one mistakes it for drift. |
| medium | `docs/specs/service/media-upload-service/upload-manager-pipeline.location-routing.supplement.md` | § Persistence matrix | link `./media-locations.zoomable-map-contract.supplement.md` | file lives at `docs/specs/service/media-locations/media-locations.zoomable-map-contract.supplement.md`; the same file's header links it correctly with `../media-locations/…` | spec wrong — **broken link, inconsistent with its own header** |

### 2.5 `docs/playbooks/upload-manager-playbook.md` (plan § 6 lead 2 — **confirmed**)

| Line | Claim | Reality | Verdict |
| --- | --- | --- | --- |
| 19 | `apps/web/src/app/core/upload-manager.service.ts` | `apps/web/src/app/core/upload/upload-manager.service.ts` | spec wrong |
| 20 | `…/core/upload-manager.types.ts` | `…/core/upload/upload-manager.types.ts` | spec wrong |
| 21 | `…/core/upload-new-pipeline.service.ts` | `…/core/upload/pipelines/new/…` | spec wrong |
| 22 | `…/core/upload-*.service.ts` glob | no service matches at that level | spec wrong |
| 76, 77, 126, 189, 229 | `upload-simplified-pipeline.service.ts`, `upload-job-state.service.ts`, `upload-retry.service.ts`, `optimized-dedup.service.ts`, `chunked-upload.service.ts` | four are **proposals** that were never built; `upload-job-state.service.ts` exists at `core/upload/support/` | mixed — proposals, not drift, but indistinguishable from drift as written |
| 190, 230 | `supabase/migrations/YYYYMMDDHHMMSS_*.sql` placeholders | never created | proposal |
| 10 | "18+ phases" | **20** (`04-state-machine.md` § 2) | spec wrong |
| 32-42 | "Current Phases" list | lists **16**; omits `converting_format`, `resolving_location`, `awaiting_disambiguation`, `skipped` | spec wrong |
| 13 | "~600 lines in service" | `upload-manager.service.ts` is **443** lines; the subsystem is **19,049** | spec wrong — understates the problem by 40× |
| 63 | "Keep old service for backward compatibility during transition" | root `AGENTS.md` § Change-Completeness Rule (Hard Blocker): "A change is not done until the thing it replaces is gone" | **the playbook's advice contradicts a Hard Blocker** |

**Recommendation (report only, per plan § 7 — no file is moved here):** archive `docs/playbooks/upload-manager-playbook.md`. It describes a tree that has not existed for two reorganisations, understates the size by an order of magnitude, miscounts the phases, and its central recommendation ("collapse to 5 phases") is now known to be a behaviour change rather than a cleanup (`04-state-machine.md` § 2). Its one durable contribution — that the phase count is a problem — is preserved in this audit.

`docs/playbooks/change-classification-upload-example.md` is in far better shape: its only broken reference is `scripts/check-change-completeness.mjs:116`, a script that does not exist. Low priority.

---

## 3. Claim-level drift

| # | Priority | Spec path | Section | Claim | Reality (`path:line`) | Verdict | One-line fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | **blocker** | `docs/specs/service/media-upload-service/upload-manager.md` | Acceptance Criteria `:277` | `- [x] Orphaned storage files are cleaned up when DB insert fails` | `apps/web/src/app/core/upload/support/upload-file-persist.util.ts:198-200` returns `{ error: dbError }` with **no** storage removal. The two cancel paths (`:135-138`, `:202-209`) do clean up; the DB-error path does not. | **code wrong**, and the AC is falsely ticked | remove the object on the `dbError` branch; untick until then |
| C2 | **high** | same | Acceptance Criteria `:280` | `- [x] \`beforeunload\` warning shown when \`isBusy()\` is true` | `apps/web/src/app/core/upload/upload-manager.service.ts:237` — `private readonly beforeUnloadHandler = (): void => {};`. A listener that neither calls `preventDefault()` nor sets `returnValue` raises no prompt. | **code wrong**, AC falsely ticked | implement the handler; untick until then |
| C3 | **high** | `upload-manager.md` vs `upload-manager-pipeline.dedup-scope.supplement.md` | AC `:264` vs § Behavior matrix | `upload-manager.md:264` — `- [ ] Duplicate hash matches are resolved via explicit user decision (use_existing, upload_anyway, reject) **rather than auto-skip**`. `dedup.md` § Behavior matrix — "Same user, hash match → **Auto-skip** — `phase=skipped`", and its AC "Same-user match auto-skips without modal" is **ticked**. | code implements the `dedup.md` behaviour (`apps/web/src/app/core/upload/support/upload-dedup-match.util.ts:33-45`) | **both** — two normative specs mandate opposite behaviour for the same input | decide once; `dedup.md`'s resume-safety goal is the stronger argument, so `upload-manager.md:264` should be reworded to "colleague matches" |
| C4 | high | `upload-manager.md` | Contract table `:139` | `job.issueKind` is `'duplicate_photo' \| 'missing_gps' \| 'conflict_review' \| 'upload_error' \| null` | `apps/web/src/app/core/upload/upload-manager.types.ts:103-111` has **8** members. Worse, `duplicate_photo` — the one the spec names first — **has no write site anywhere**; the real duplicate kind is `duplicate_file` (`core/upload/support/upload-dedup-match.util.ts:49`). | **both** — spec lists a stale subset **and** the code keeps a dead member read in 10 places | sync the table to the 8 members; delete `duplicate_photo` from code and its 10 readers |
| C5 | medium | `docs/specs/component/upload/upload-resolver-tray.stepper-fsm.supplement.md` | § Tray steps | steps are `1a`, `1b`, `3` | `UploadTrayStep` = `'1a' \| '1b' \| '2' \| '3'` at **two** places, `core/upload/upload-manager.types.ts:123` and `core/upload/address-resolution/upload-address-resolution.types.ts:66`. `'2'` has no write site among the 8 `trayStep:` writes. | **code wrong** (spec is right) | drop `'2'`; collapse the duplicate declaration |
| C6 | medium | `upload-resolver-tray.stepper-fsm.supplement.md` | § Tray steps `disambiguationKind` column | names `city_step`, `house_step`, `geocode` | `UploadDisambiguationKind` has 8 members; **7** are written in production, adding `source`, `admin_level_conflict`, `containment_check`, `layer_package` (`04-state-machine.md` § 5.6) | spec wrong (incomplete) | extend the table, or state that it covers only the city/house/geocode chain |
| C7 | medium | none | — | `UploadGroupResolutionStatus` — 7 members, 20+ write sites across 4 files (`core/upload/address-resolution/upload-address-resolution.types.ts:55-62`) | **no spec defines this FSM.** The nearest file, `…/upload-address-resolution.phases.md`, is 936 bytes and does not contain the union | spec missing | add the transition table to `upload-address-resolution.phases.md` |
| C8 | medium | `upload-manager.md` | State table `:149` | `activeCount` — "Computed: jobs in uploading/saving/resolving" | `apps/web/src/app/core/upload/support/upload-job-state.service.ts:40-54` — `ACTIVE_PHASES` has **13** members including `validating`, `parsing_exif`, `converting_format`, `hashing`, `dedup_check`, `extracting_title`, `conflict_check` | spec wrong (understated) | list the set, and note that it deliberately excludes `queued` and both `awaiting_*` phases |
| C9 | medium | `upload-manager.md` | State table `:147` / `:150` | `isBusy` — "Computed: any non-terminal job exists"; `activeCount` as above | Both are accurate individually, but the spec never says they **disagree**: a job parked at `awaiting_disambiguation` makes `isBusy()` true and contributes 0 to `activeCount()` (`04-state-machine.md` S7) | spec wrong (incomplete) | state the divergence explicitly, or unify the two definitions |
| C10 | low | `upload-manager.md` | Wiring `:241` | "`batchProgress$` → `UploadButtonZone` — shows progress ring or badge" | no `UploadButtonZone` exists (§ 2.4) | **both** — the spec wires a non-existent consumer | remove the row, or build the component |
| C11 | low | `docs/specs/service/media-upload-service/upload-manager-pipeline.location-routing.supplement.md` | § Pre-upload resolution table | The table is **split in half** by the prose block "### Phase 3 — source-conflict resolution record" and "### Tray Continue gate": rows 0–4 render as one table, then unrelated prose, then orphan rows `\| 5 \|` and `\| 6 \|` which do **not** render as part of it | markdown structure only; the content is correct | spec wrong (formatting) | move the two `###` blocks below the completed table |
| C12 | low | same | § Distance radii | `contextDistanceMaxMeters` default **120 000 m** | `apps/web/src/app/core/upload/location/upload-location-config.ts` does not define it (it is org Search Tuning, per the spec) — `sourceAgreementRadiusMeters: 150` (`:67`), `exifAssistRadiusMeters: 80` (`:68`), `mismatchToleranceMeters: 15` (`:69`), `titleConfidenceThreshold: 0.8` (`:77`) all **match** `upload-location-config.md:59,60,68` and `upload-manager.md:258` | **no drift** — recorded as verified-correct so a later reader does not re-check |

---

## 4. Service-module symmetry (root `AGENTS.md` § Code Conventions)

### 4.1 Required files per module

| Requirement | `core/upload` | `core/upload-resolver-tray-orchestrator` |
| --- | --- | --- |
| `[name].service.ts` | ✅ `upload.service.ts` | ✅ |
| `[name].service.spec.ts` | ✅ | ✅ |
| `[name].types.ts` | ✅ `upload.types.ts` | ✅ |
| `[name].helpers.ts` | ⚠️ `upload.helpers.ts` exists but has **zero importers** (`01-structure.md` § 5) — the rule is satisfied by a dead file | ✅ |
| `adapters/` | ✅ (2 files) | ✅ (1 file) |
| `README.md` | ✅ | ✅ |

### 4.2 One central `types.ts` per module — **violated**

"Keep one central `types.ts` per module; do not split into nested sub-service type files." `core/upload` has **four**: `upload.types.ts`, `upload-manager.types.ts` (396 LOC), `address-resolution/upload-address-resolution.types.ts`, `address-resolution/upload-area-evidence.types.ts`. The last two are exactly the "nested sub-service type files" the rule forbids. Compounded by `UploadTrayStep` being declared identically in two of them (C5) and by three overlapping "branch" unions (`04-state-machine.md` § 5.7). Verdict: **code wrong**, severity `medium`.

### 4.3 No global adapter folder — **satisfied**

`apps/web/src/app/core/adapters/` does not exist.

### 4.4 Facade slim, heavy logic in `adapters/` — **violated**

`core/upload/adapters/` is 2 files / 127 LOC, while `SupabaseService` is reached from **17 files across 7 folders**, including the UI layer (`01-structure.md` § 6.1). Verdict: **code wrong**, severity `medium`.

### 4.5 Adapter spec mirror — **inverted**

`AGENTS.md` § Spec split: "Adapter boundaries match `apps/web/src/app/core/<module>/adapters/` → add `docs/specs/service/<module>/adapters/<name>.adapter.md`."

| Code adapter | Spec |
| --- | --- |
| `apps/web/src/app/core/upload/adapters/upload-location-lookup.adapter.ts` | **none** |
| `apps/web/src/app/core/upload/adapters/upload-project-locations.adapter.ts` | **none** |
| `apps/web/src/app/core/upload-resolver-tray-orchestrator/adapters/upload-location-tray-producer.adapter.ts` (349 LOC) | **none** |
| *(no code)* | `docs/specs/service/media-upload-service/adapters/upload-project-gps-reference.adapter.md` |

Three shipped adapters with no spec; one spec with no code (the latter deliberate, § 2.4). Verdict: **spec missing**, severity `medium`. This also **completes plan § 6 lead 8**: the directory is not empty, but the mirror it is supposed to provide is inverted.

### 4.6 Governance registry gap

`docs/specs/GOVERNANCE-MODULE-REGISTRY.json` registers `core/upload` → `docs/specs/service/media-upload-service` as a `full-service-module`, and `features/upload` → `docs/specs/ui/upload/upload-panel-system.md` as a `ui-bound-module`. The `core/upload` name mismatch is therefore **documented and legitimate**, not a violation.

But **`core/upload-resolver-tray-orchestrator` has no registry entry at all**, despite being a full service module (service + helpers + types + spec + README + adapters, 1,092 LOC) whose spec is filed as a *child* of a different module's folder (`docs/specs/service/media-upload-service/upload-resolver-tray-orchestrator.md`). Verdict: **spec/governance wrong**, severity `medium`.

---

## 5. Spec-size gate (plan § 6 lead 9 — confirmed, magnitude corrected)

| Spec | `wc -l` | linter count | Cap | Over by |
| --- | --- | --- | --- | --- |
| `docs/specs/component/upload/upload-panel.md` | 309 | 310 | 180 error / 150 warn | **+130** |
| `docs/specs/service/media-upload-service/upload-manager-pipeline.md` | 283 | 284 | 180 | **+104** |
| `docs/specs/service/media-upload-service/upload-manager.md` | 280 | 281 | 180 | **+101** |
| `docs/specs/component/media/media-item-upload-overlay.md` | 253 | 254 | 180 | +74 |

The plan's "552 counted lines vs a 400 recommendation" does not reproduce on this commit (`00-baseline.md` § 7). The real numbers are smaller but the gate is still failed by four upload specs, and the **largest offender is `upload-panel.md`, not `upload-manager-pipeline.md`**. A split proposal respecting `docs/specs/README.md` § Spec split is in `09-coverage.md`.

Structural violations reported by `lint:specs` on top of the size cap: `upload-resolver-tray.md`, `upload-shell.md`, `upload-address-resolution-pipeline.md`, `upload-location-resolution.md`, `upload-resolver-tray-orchestrator.md` each miss the same four required sections (What It Looks Like / Where It Lives / Actions / Component Hierarchy), and `upload-search-object.md` misses `## What It Is` plus five more (`00-baseline.md` § 7).

---

## 6. What Phase 5 did **not** check

| Not checked | Check needed |
| --- | --- |
| Claim-by-claim over the 12 address-resolution and Search Object specs (`address-resolution-model.md` 141 lines, `contradiction-resolution-model.md` 192, `upload-search-object.*` ×4, `upload-address-resolution.*` ×4) | These describe the densest algorithm in the subsystem. Verifying them requires the Branch C pass deferred as `03-branch-matrix.md` § 9 L12. **Explicitly unverified.** |
| Claim-by-claim over `upload-manager-pipeline.data.md` (290 lines of data matrices) | A column-by-column diff against `media_items` and `UploadJob` |
| Claim-by-claim over the five `upload-panel.*` slices | A per-action diff against `upload-panel-item.component.ts` — overlaps `03-branch-matrix.md` C6 |
| Whether the neighbouring service specs of plan § 2.1 last row (`folder-scan/`, `metadata/`, `media/`, `projects/`, `wide-event/`) drifted | Same mechanical path sweep, widened |
| That the 60 broken paths are the *complete* set | The sweep matched `apps/web/src/app/…`, `core/…`, `features/…`, `shared/…`, `layout/…`, `supabase/…`, `scripts/…` with `.ts`/`.html`/`.scss`/`.sql`/`.mjs`/`.cjs`/`.js` extensions. A path written in prose without an extension, or with a different prefix, would be missed. |
