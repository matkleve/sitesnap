# 00 — Baseline (Phase 0)

**Audit:** Full analysis of the file upload process
**Plan:** [`docs/backlog/prompt-analysis-upload-process.md`](../../backlog/prompt-analysis-upload-process.md)
**Measurement date:** 2026-09-08
**Repository state:** `8e4b1e09fe1bb5c52b8a01cc64b21e52cbff9735` (`docs(backlog): add executable analysis plan for the upload process`), branch `claude/upload-process-analysis-0mnzwr` branched from `origin/main`.
**Working tree:** clean apart from this audit folder. No file under `apps/web/src/app/**`, `supabase/migrations/**` or `docs/specs/**` was modified in this pass.

---

## 1. Environment

| Item | Value |
| --- | --- |
| Platform | Linux 6.18.44-fc-v24 (container, no display) |
| Node | v22.22.2 |
| npm | 10.9.7 |
| Chromium | present at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (Playwright bundle) |
| Supabase CLI | **absent** (`which supabase` → not found) |
| Supabase credentials | **absent** — `apps/web/src/environments/environment.ts:9` ships `anonKey: 'test'`; no `SUPABASE_*` variables in the environment |
| Network | outbound HTTPS through an agent proxy; npm registry reachable |

### Install

| Command | Result | Duration |
| --- | --- | --- |
| `npm install` (root) | OK — already installed, no changes | 0.3 s |
| `cd apps/web && npm install` | OK — 667 packages added (tree was empty) | 12.8 s |

---

## 2. Gate results

| # | Command | Exit | Duration | Verdict |
| --- | --- | --- | --- | --- |
| B1 | `cd apps/web && npx ng build` | **0** | 25.8 s | **green** (7 budget/CommonJS warnings) |
| B2 | `cd apps/web && npx ng test --watch=false` | **1** | 17.7 s | **RED — suite does not compile; 0 tests executed** |
| B2a | `cd apps/web && npx ng test --watch=false --browsers=ChromeHeadless` | 1 | 0.7 s | **command in the plan is invalid for this repo** (see § 4) |
| B3 | `cd apps/web && npm run lint` | **1** | 10.7 s | **RED — 151 errors, 1068 warnings** |
| B4 | `npm run lint:specs` | **1** | 0.3 s | **RED — 183 specs checked, 201 errors, 32 warnings** |
| B5 | `npm run design-system:check` | **0** | 0.5 s | green (12 raw font-size warnings in `shared/`) |
| B6 | `npm run i18n:check` | **0** | 0.3 s | green (`violations=0`) |
| B7 | `npm run i18n:guard` | **0** | 0.2 s | green in non-strict mode; 7 `@else`/`@default` text-node false positives reported, none in upload scope |
| B8 | `npm run supabase:smoke` | **0** | ~1 s | green — but **static**: both scripts parse `supabase/migrations/*.sql` text, they never contact a database (see § 5) |

**Baseline is red on B2, B3 and B4.** Per plan § 4 Phase 0 this is recorded as a finding, not a blocker.

---

## 3. B1 — `ng build` detail

Build succeeds. Output at `apps/web/dist/web`. Warnings, verbatim classes:

- 3 × SCSS budget overrun (`address-field-combobox.component.scss` +1.50 kB, `media-detail-location-section.component.scss` +308 B, `settings-overlay.component.scss` +3.40 kB) — none in upload scope.
- 4 × "not ESM / CommonJS bailout": `qrcode`, `jszip`, `leaflet`, and **`heic2any` used by `apps/web/src/app/core/upload/support/upload.service.util.ts`** — the only upload-scope build warning. It is an optimization bailout, not an error.

---

## 4. B2 — unit test suite (RED, highest-severity Phase 0 finding)

### The plan's command does not exist in this repo

`ng test --browsers=ChromeHeadless` fails immediately:

```
The following packages are required but were not found:
  - The "browsers" option requires either "@vitest/browser-playwright",
    "@vitest/browser-webdriverio", or "@vitest/browser-preview" to be installed.
```

`apps/web/angular.json` declares the `test` target as `{"builder": "@angular/build:unit-test"}` with no options; the underlying runner is Vitest in Node, not Karma/Chrome. The correct baseline command is `npx ng test --watch=false`. Plan § 4 Phase 0 should be corrected (recorded as drift, not fixed here).

### The suite does not compile

`npx ng test --watch=false` exits 1 during the Angular compiler plugin pass with **101 `✘ [ERROR]` TypeScript diagnostics across 26 spec files**. Because compilation aborts, **no test executes at all** — there is no pass/fail count, and the 43 upload spec files in scope are all unrun.

TypeScript error-code histogram:

| Code | Count |
| --- | --- |
| TS2339 (property does not exist) | 63 |
| TS2345 (argument not assignable) | 10 |
| TS2322 (type not assignable) | 8 |
| TS2307 (cannot find module) | 5 |
| TS2352 (unsafe conversion) | 3 |
| TS2353 (unknown object literal property) | 3 |
| TS2551, TS2540, TS7053, TS18046 | 1 each |

Dominant clusters (non-upload): `map-shell.*.spec.ts` (≈ 60 errors, all `uploadPanelOpen`/`uploadPanelPinned`/`onSearchClearRequested` missing on `MapShellComponent`), `location-resolver.service.spec.ts` (5 × TS2307, module not found), `media-locations.helpers.spec.ts`, `search/providers/*`.

### Upload-scope compile errors (all 11, verbatim)

| # | File:line | Error |
| --- | --- | --- |
| T1 | `apps/web/src/app/core/upload/location/upload-location-resolution.service.spec.ts:39` | TS2322: Type `"source_conflict"` is not assignable to type `UploadJobIssueKind \| undefined` |
| T2 | `apps/web/src/app/core/upload/pipelines/new/upload-new-post-save.util.spec.ts:124` | TS2322: mock signature omits the `'missing_data'` phase accepted by the production callback |
| T3 | `apps/web/src/app/core/upload/pipelines/new/upload-new-pre-resolve.util.spec.ts:52` | TS2352: cast of a partial mock to `Pick<PreResolveDeps, …> & { addressOrchestrator?: … }` no longer overlaps |
| T4 | `apps/web/src/app/core/upload/pipelines/new/upload-new-pre-resolve.util.spec.ts:85` | TS2352: same |
| T5 | `apps/web/src/app/core/upload/upload-folder-upload.integration.spec.ts:138` | TS2322: `Uint8Array<ArrayBufferLike>` not assignable to `BlobPart` |
| T6 | `apps/web/src/app/features/upload/upload-panel/upload-panel-destructive-confirm.spec.ts:9` | TS2345: `HTMLDivElement` passed where `ElementRef<HTMLElement>` is required |
| T7 | `apps/web/src/app/features/upload/upload-panel/upload-panel-input-handlers.spec.ts:66` | TS2352: hand-rolled `FileList` lacks `[Symbol.iterator]` |
| T8 | `apps/web/src/app/features/upload/upload-panel/upload-panel.map-pick.spec.ts:42` | TS2345: `ImageUploadedEvent` literal missing `jobId`, `batchId` |
| T9 | `apps/web/src/app/core/location-path-parser/upload-area-evidence.helpers.spec.ts:127` | TS2345: `FieldLevelEntry[]` shape mismatch |
| T10 | `apps/web/src/app/core/location-path-parser/upload-area-evidence.helpers.spec.ts:130` | TS2345: same |
| T11 | `apps/web/src/app/core/location-path-parser/upload-search-object.completeness.helpers.spec.ts:60` | TS2353: `'district'` does not exist in `Partial<UploadSearchObject>` |

T1, T2, T8, T9, T10 and T11 are **stale-test-after-production-change** signatures: the spec still references a union member, a field or an event shape that production types no longer carry. That is the exact failure class root `AGENTS.md` § Change-Completeness Rule names as "the single most expensive recurring failure in this codebase". Follow-up in Phase 9.

**Consequence for the rest of this audit:** no conclusion in any later phase may be supported by "the tests pass". Every claim rests on reading code, on `ng build`, or is marked `unverified`.

---

## 5. B8 — `supabase:smoke` is not a live check

Both scripts under `npm run supabase:smoke` read `supabase/migrations/*.sql` from disk and assert on the SQL text; neither opens a connection:

- `scripts/validate-supabase-rpc-media-type.mjs` → `find_photoless_conflicts` / `idx_media_items_photoless_lookup` resolved from `20260526200000_fix_find_photoless_conflicts_locations_join.sql`; latest index predicate `media_type = 'photo' AND storage_path IS NULL`.
- `scripts/validate-supabase-storage-cleanup-api-mode.mjs` → `cleanup_orphaned_storage_objects` / `run_storage_cleanup_job` resolved from `20260318144000_storage_cleanup_runner_api_only.sql`.

A green B8 therefore proves that the committed migrations are internally consistent, **not** that the hosted schema matches them. Every Phase 8 statement about *runtime* database behaviour stays `unverified`.

---

## 6. B3 — eslint baseline, upload scope

Repo-wide: **151 errors, 1068 warnings** (`--max-warnings 0` is not configured in the script, so warnings do not fail; the errors do).

Upload subsystem share: **21 errors, 224 warnings**. Errors by file:

| Errors | File |
| --- | --- |
| 4 | `apps/web/src/app/core/upload/location/upload-location-resolution.service.ts` |
| 3 | `apps/web/src/app/features/upload/upload-resolver-tray/upload-resolver-tray.component.ts` |
| 2 | `apps/web/src/app/features/upload/upload-shell/upload-shell.component.ts` |
| 2 | `apps/web/src/app/core/upload/location/upload-location-tray-flow.service.ts` |
| 1 | `apps/web/src/app/features/upload/upload-panel/upload-panel.component.ts` |
| 1 | `apps/web/src/app/features/upload/upload-panel/upload-panel-setup.service.ts` |
| 1 | `apps/web/src/app/features/upload/upload-panel/upload-panel-lifecycle.service.ts` |
| 1 | `apps/web/src/app/core/upload/upload-manager.service.ts` |
| 1 | `apps/web/src/app/core/upload/pipelines/new/upload-new-post-save.util.ts` |
| 1 | `apps/web/src/app/core/upload/pipelines/attach/upload-attach-update-data.util.ts` |
| 1 | `apps/web/src/app/core/upload-resolver-tray-orchestrator/upload-resolver-tray-orchestrator.service.ts` |
| 1 | `apps/web/scripts/split-upload-panel.cjs` (throwaway migration script, still committed) |
| 1 | `apps/web/scripts/move-upload.cjs` (same) |

Raw output kept in the scratchpad; per-rule detail is carried into Phase 6.

---

## 7. B4 — `lint:specs` baseline, upload scope

Repo-wide: **183 specs checked, 201 errors, 32 warnings.** Rule histogram: `spec-required-sections` 152, `spec-max-lines` 64, `what-it-is-length` 8, `spec-section-order` 7, `settings-section-format` 2.

Upload specs, as reported by the linter (**line counts are the linter's own**):

| Spec | Lines | Result |
| --- | --- | --- |
| `docs/specs/component/media/media-item-upload-overlay.md` | 254 | 1 error (`spec-max-lines`) |
| `docs/specs/component/upload/upload-button-zone.md` | 128 | OK |
| `docs/specs/component/upload/upload-panel.md` | 310 | 1 error (`spec-max-lines`) |
| `docs/specs/component/upload/upload-resolver-tray.md` | 148 | 4 errors (`spec-required-sections`: What It Looks Like / Where It Lives / Actions / Component Hierarchy) + 1 warning |
| `docs/specs/component/upload/upload-shell.md` | 37 | 4 errors (same four sections) + 1 warning |
| `docs/specs/service/media-upload-service/upload-address-resolution-pipeline.md` | 65 | 4 errors (same four sections) |
| `docs/specs/service/media-upload-service/upload-location-config.md` | 139 | OK |
| `docs/specs/service/media-upload-service/upload-location-resolution.md` | 72 | 4 errors (same four sections) |
| `docs/specs/service/media-upload-service/upload-manager-pipeline.md` | **284** | 1 error (`spec-max-lines`) |
| `docs/specs/service/media-upload-service/upload-manager.md` | **281** | 1 error (`spec-max-lines`) |
| `docs/specs/service/media-upload-service/upload-resolver-tray-orchestrator.md` | 109 | 4 errors (same four sections) |
| `docs/specs/service/media-upload-service/upload-search-object.md` | 142 | 6 errors (missing `## What It Is` + 5 more) |
| `docs/specs/ui/upload/upload-panel-system.md` | 100 | OK |

### Drift against the plan's own numbers

Plan § 2.1 states `upload-manager-pipeline.md` is "283 lines; lint warns at **552** counted lines". Neither number reproduces: `wc -l` gives **284** and the linter reports **284** against a **180**-line error cap (not a 400-line recommendation). The "552 / 400" figures in plan § 2.1, § 6 lead 9 and § 9 Phase 9.4 are **not reproducible on this commit** and must not be quoted downstream. The underlying point survives — the parent is 284 lines against a 180 cap, i.e. **58 % over the error cap** — but the magnitude is smaller than the plan assumes.

---

## 8. Fresh territory counts (plan § 2, re-measured 2026-09-08)

Scope = `apps/web/src/app/core/upload/**`, `apps/web/src/app/core/upload-resolver-tray-orchestrator/**`, `apps/web/src/app/features/upload/**`.

| Measure | Plan § 0 | Measured now | Drift |
| --- | --- | --- | --- |
| Non-test `.ts` files in scope | 129 | **129** | none |
| Non-test LOC in scope | ≈ 19,000 | **19,049** | none |
| Test `.ts` files in scope | 43 | **43** | none |
| Test LOC in scope | ≈ 7,050 | **7,054** | none |
| `.html` + `.scss` in scope | — | **8** | — |
| Upload spec markdown files (`docs/specs/**/*upload*.md`) | 51 | **31** | **plan overstates by 20** |
| Upload spec markdown lines | ≈ 3,900 | **3,819** | ≈ none |
| `UploadPhase` union members | 20 | **20** (`apps/web/src/app/core/upload/upload-manager.types.ts:14-34`) | none |

The spec-file count discrepancy is a plan artefact, not repository drift: the plan's own § 2.1 table enumerates roughly 31 distinct upload files, and the total spec line count matches. `51` appears to have counted the neighbouring service specs of § 2.1's last row as well. **Use 31 / 3,819.**

### Pre-confirmed leads from plan § 6

Two leads are already settled by Phase 0 measurement and are carried forward, not re-derived:

- **Lead 8 — `docs/specs/service/media-upload-service/adapters/` "appears empty".** **Refuted.** The directory contains one file, `docs/specs/service/media-upload-service/adapters/upload-project-gps-reference.adapter.md` (1,787 bytes). Whether that mirrors `apps/web/src/app/core/upload/adapters/` correctly is a Phase 5 question.
- **Lead 7 — mojibake.** **Confirmed and wider than stated.** Double-encoded UTF-8 box-drawing characters are present in `apps/web/src/app/core/upload/upload-manager.types.ts:12`, i.e. not only in `upload-manager.service.ts`. Full sweep in Phase 6.5.

---

## 9. Environment limits carried into later phases

| Limit | Consequence |
| --- | --- |
| Unit suite does not compile | No behavioural claim in this audit may cite a passing test. Phase 9 reports coverage **as written**, not as executed. |
| No Supabase CLI, no credentials, `anonKey: 'test'` | Phase 8 is SQL/RLS reading only. No `supabase migration list`, no live RPC probe, no live RLS check. All runtime DB claims → `unverified`. |
| No display server, no dev server against a live backend | **Phase 10 (live/manual verification) cannot run.** Recorded as `unverified` with the per-finding list produced in `10-findings.md`. |
| `npm run supabase:smoke` is static | A green result carries no runtime evidence (§ 5). |

---

## 10. Verbatim artefacts

Raw logs are kept in the session scratchpad (per plan § 10: sweeps stay out of the deliverables) at
`/tmp/claude-0/-home-user-feldpost/46618c86-d69f-59dc-a604-dec63a9c282a/scratchpad/`:
`ng-build.log`, `ng-test.log` + `ng-test.clean.log`, `lint-web.log` + `lint-web.clean.log`, `lint-specs.log` + `lint-specs.clean.log`, `design-system-check.log`, `i18n-check.log`, `i18n-guard.log`, `supabase-smoke.log`, `npm-install-web.log`.

These are session-scoped and will not survive the container. Every number quoted above is reproducible with the commands in § 2 on commit `8e4b1e09`.
