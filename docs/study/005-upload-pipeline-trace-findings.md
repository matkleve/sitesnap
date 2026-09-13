---
id: STUDY-005
type: review
status: active
supersedes: none
corrected-by: none
---

# Upload pipeline — findings from the trace harness

**Measured:** 2026-09-12 · **Branch:** `claude/uploader-pipeline-test-badges-kktrpg` at `650f495`
(based on `main` at `568b44b`) · **How:** by running the pipeline, not by reading it.

Every finding below came out of
[`npm run trace:upload`](../playbooks/upload-pipeline-trace.md) — a headless harness that pushes a
synthetic corpus through the real `UploadManagerService`, `classifyBatch`, token classifier, layer
map, branch gates, content hashing, queue, phase FSM and `persistUploadFile`, against an in-memory
Supabase and a stub geocoder. What is real and what is substituted is listed in the playbook's
[Real vs mock](../playbooks/upload-pipeline-trace.md#real-vs-mock) table and printed by the harness
itself.

**Companion:** decisions and the correction plan are [STUDY-006](./006-upload-pipeline-correction-plan.md).
Findings struck through in the register carry a dated **Fix** block with the measurement that proves
it; the rest are open. The upload pipeline is **Sensitive** class
([`AGENTS.md`](../../AGENTS.md) § Change Classification), and four of these findings are
spec-level — the spec says what the code does, so a fix needs a contract decision first.

## Severity

| | Meaning |
| --- | --- |
| **High** | Wrong data reaches the database, or the feature does not work at the size it is sold for. |
| **Medium** | Correct output, but the user pays for it in questions or waiting. |
| **Low** | Internal or documentation inaccuracy with no direct user consequence. |

## Register

| id | Finding | Severity | Layer |
| --- | --- | --- | --- |
| [F-01](#f-01) | ~~A number in the file name is classified as a postcode and overrides the folder~~ **fixed** | High | **Spec** |
| [F-02](#f-02) | ~~`Wien` resolves to the municipality `Schottwien`~~ **fixed** | High | Data + code |
| [F-03](#f-03) | ~~City classification requires an explicit country segment in the path~~ **fixed** | High | **Spec** |
| [F-04](#f-04) | ~~Ordinary file names form competing street-level layer packages~~ **fixed** | Medium | Code |
| [F-05](#f-05) | `locationRequirementMode: 'optional'` does not skip the address pipeline | Medium | **Spec** ↔ code |
| [F-06](#f-06) | Classification costs ~9 ms/file and blocks the first upload | High | Code |
| [F-07](#f-07) | The job store is `O(n)` per write, so a batch is `O(n²)` | High | Code |
| [F-08](#f-08) | Tray volume scales linearly with the file count | High | **Spec** (product) |
| [F-09](#f-09) | The `test` gate compiles nothing, so it runs no specs | Medium | Repo |
| [F-10](#f-10) | Two gate debt notes state numbers that no longer match | Low | Repo |
| [F-11](#f-11) | ~~A meaningless folder segment outranks a valid address in the file name~~ **fixed** | High | Code |
| [F-12](#f-12) | The unit suite is order-dependent; the count depends on a build cache | Medium | Repo |
| [F-13](#f-13) | `ng test` never loads `vitest.config.ts`, so its aliases are inert in CI | Medium | Repo |
| [F-14](#f-14) | ~~An async tray gate is overwritten by the hashing step, stranding the job~~ **fixed** | High | Code |
| [F-15](#f-15) | ~~A path carrying a complete address **twice** can yield an empty Search Object~~ **fixed** | High | **Spec** |
| [F-16](#f-16) | ~~One held job in a resolved group holds every job in it, and stops the rest being placed~~ **fixed** | High | Code |
| [F-17](#f-17) | A parked job keeps its content-hash reservation, so a later identical file is skipped as a duplicate of a file that was never uploaded | High | Code |

---

### F-01 · A number in the file name is classified as a postcode and overrides the folder {#f-01}

**What happens.** `AT/Wien/1090/Währinger Straße 12/IMG_1274.jpg` produces a Search Object whose
postcode is **1274**, not 1090. `IMG_1275.jpg` in the same folder produces **1275**. The two photos
therefore get different `groupingKey`s and are geocoded separately. `[A]` — harness output, run A of
`npm run trace:upload`:

```
    postcode     = 1090                     ← folder (conf 1)
    postcode     = 1274                     ← filename (conf 1)
    groupingKey: at|wien|1274|schottwien|wahringer straße|12
    areaEvidence: … postcode@[L2:1090 L0:1274]
    areaConflicts: postcode, city
```

**Why.** Two rules compose into this, and both are as specified:

1. `path-token-classifier.ts:182-183` classifies any token matching the country's postcode pattern
   as a postcode once the country is known. `[A]` AT's pattern is four digits, and `IMG_1274`
   tokenizes to `IMG` + `1274`. The spec mandates exactly this — `upload-search-object.md`
   § Token classification order, pass 2 point 1. `[A]`
2. `upload-area-evidence.helpers.ts:139-156` (`collapseAreaFlatFields`) keeps the entry with
   the **lowest** level index, and level 0 **is the file name**. `[A]` Also mandated —
   `upload-search-object.md` § Admin level map, "Flat fields MUST collapse to the entry with the
   lowest level index". `[A]`

**Consequence.** Three, compounding: the stored postcode is wrong; one building fragments into one
group per file, so batch geocoding stops working; and `city`/`postcode` then disagree across levels,
which raises `areaConflicts` and opens an `admin_level_conflict` tray — a question about a
path that was never ambiguous. `[A]`

**Scale.** With camera file naming, **zero** of 2 000 generated paths reached `branch_a`; with
6-digit leaf numbers that cannot parse as an AT postcode, 549 of 2 000 (27 %) did. `[B]` — synthetic
corpus, real classifier.

**Fixed 2026-09-13** (Phase 1.1–1.2, D-01 option A′). A **numeric** level-0 admin entry is now
written only when the same filename also yields a street-level token at confidence ≥ 0.9;
`upload-search-object.md` § Admin level map carries the rule, and
`upload-search-object.builder.ts` implements it. Named tokens are not gated, so `Graz.jpg` still
contributes its city — the gate was narrowed from "all admin fields" to "numeric admin fields"
during implementation, because an existing test objected and every measured instance of the defect
is numeric. `[A]`

Measured effect, curated corpus: tray questions **13 → 9**, and `SO-FILENAME-OVERRIDES-FOLDER`
reports nothing. `[A]` At 500 generated paths the `camera` and `neutral` naming runs are now
**identical** — 391 groups, 269 needing a tray, same outcome histogram — where before camera naming
put **100 %** of groups in a tray with `branch_a` at zero, against neutral's 27 %. `[A]` That
equality is the proof: file naming no longer changes what the pipeline does.

**Note.** There is a guard for exactly this shape on the street side — `isWeakFilenameStreetLevel`
(`upload-search-object.layer-map.ts:89-98`) special-cases `^img_\d+$` so `IMG_1274` does not form a
street package. `[A]` No numeric counterpart exists. `[A]`

**Correction, 2026-09-12** (measured after the first version of this study). The "legitimate file-name
postcode" this defect is entangled with mostly **does not work today anyway**, so barring file names
from admin fields gives up less than first stated. Scenario S17,
`Baustelle Nord/1090 Mühlenstraße 12.jpg`: the `1090` is classified as **nothing at all** and is
dropped — pass 2 only accepts a postcode once a country is known, and no folder segment names one;
the house-number fallback is capped at three digits without a country. `[A]` A file-name postcode is
therefore honoured **only** when a folder level supplies the country — which is exactly the situation
in which a camera name is also honoured. `[A]` Street-level fields from the file name are unaffected
and do land on the Search Object (see [F-11](#f-11) for the separate reason they can still be lost).

---

### F-02 · `Wien` resolves to the municipality `Schottwien` {#f-02}

**What happens.** Every path segment `Wien` sets `city = Schottwien` at confidence 0.992. `[A]`

```
    state        = Wien                     ← folder (conf 0.9999999999999999)
    city         = Schottwien               ← folder (conf 0.9920567176527572)
```

**Why.** `apps/web/src/assets/geo/at-gemeinden-bev.json` contains `Wien-Alsergrund`,
`Wien-Brigittenau`, … and `Schottwien`, but **no plain `Wien`** — verified: filtering the 2 114
records for `n === 'Wien'` returns an empty array. `[A]` `classifyWithFuse`
(`path-token-classifier.ts:86-109`) searches it with `threshold: 0.4` and accepts any hit at
confidence ≥ 0.9 `[A]`; `Schottwien` scores 0.992, which the spec's confidence table treats as a
plain write, not even an uncertain one (`upload-search-object.md` § Confidence thresholds: ≥ 0.98 →
"Write field"). `[A]`

**Consequence.** Vienna is Austria's largest city and the wrong city is written with full
confidence. It then disagrees with `state = Wien`, which raises an `areaConflicts` entry and
opens a tray. `[A]` Six of the 15 curated scenarios hit it. `[A]`

**Fixed 2026-09-13** (Phase 1.3–1.4, D-02). `classifyWithFuse` now consults an **exact** normalized
name/alias index before Fuse, and rejects a fuzzy hit whose length differs from the token by more
than `max(2, ⌈len × 0.25⌉)`. `Wien` (4) against `Schottwien` (10) exceeds the bound, so the gap now
fails visibly instead of resolving to a neighbour; the Vienna postcodes in `at-plz.json` supply
`city = Wien` through the expansion step instead. The index is memoized per dataset, which also
removes one per-token rebuild from [F-06](#f-06). `[A]`

Measured on the curated corpus: `SO-CITY-NOT-IN-PATH` **6 instances → 0** `[A]`, and at 500 generated
paths `admin_conflict` went **53 → 0** with `branch_a` 129 → 166. `[A]` `layer_conflict` rose 261 →
277, because a path that no longer gets a wrong city falls through to street fragments instead —
which is [F-04](#f-04)/[F-11](#f-11), not a regression of this fix. `[C]`

**Typo tolerance was already zero** and is unchanged: `Klagenfurth` matched nothing before the length
bound either, because the 0.9 confidence floor rejects near misses. `[A]` Recorded so the bound is
not blamed for it later.

**Wider risk.** `[C]` This is a class, not one row: any token that is not itself in the gazetteer but
is a substring of an entry can be substituted at ≥ 0.9 confidence. The harness reports the class as
`SO-CITY-NOT-IN-PATH` (a city value that does not occur literally in the path); postcode expansion
is excluded from that check, since those cities are looked up rather than matched.

---

### F-03 · City classification requires an explicit country segment in the path {#f-03}

**What happens.** `Graz/Annenstraße 10/DSC_0001.jpg` produces a Search Object with **no fields at
all** — `groupingKey` is `|||||`. `Graz` becomes a street fragment at confidence 0.5. `[A]`

**Why.** `path-token-classifier.ts:210` computes `useAtGeo = countryCode === 'AT'` and line 138 only
consults the gazetteer when it is true. `[A]` Without an `AT` segment earlier in the path there is
no country, so neither state nor city is ever attempted. Specified: `upload-search-object.md`
§ Token classification order, step 5, "AT gazetteer only when `country === 'AT'`". `[A]`

**Consequence.** A construction company that names folders `Graz/Annenstraße 10` — the natural
shape, and the one a user would expect to work — gets no address at all, and the file lands in a
tray or in Issues. `[A]` Combined with [F-04](#f-04) the folder's own street is offered back to the
user as one option among several. `[A]`

**Fix, 2026-09-13** ([STUDY-006](./006-upload-pipeline-correction-plan.md#d-03) D-03, Phase 2.1).
The country is now **derived from the place** instead of being required before one can be looked up:
an exact name/alias match against the country-carrying `CITY_REGISTRY` and the AT gazetteers sets
`city` / `state` and emits the country it implies, marked `countryProvenance: 'derived'`. Fuzzy
matching stays gated on `country === 'AT'`, because a near miss in one country's gazetteer is no
evidence of that country. Contract:
[`upload-search-object.country-derivation.md`](../specs/service/media-upload-service/upload-search-object.country-derivation.md).

Measured. `Graz/Annenstraße 10/DSC_0001.jpg` now yields `country=AT city=Graz street=Annenstraße
houseNumber=10`, `groupingKey at|||graz||10` — it was `|||||` `[A]`. At 500 generated paths: groups
**391 → 442** (the 51 that were empty Search Objects now are addresses), `branch_a` **166 → 214**,
`layer_conflict` **277 → 229**, tray questions **269 → 237**, and camera vs neutral naming stay
identical, so [F-01](#f-01)'s parity survives. `[A]` Classification also got *faster*, 9.1 →
5.5-6.6 ms per file over two runs, because the exact index answers before a Fuse index is built.
`[A]`

On the curated corpus tray questions went **9 → 12** — the right direction even though the number
rose: three paths that used to classify to nothing now carry a real address whose folder and file
name contradict each other, and being asked is the correct outcome. `[A]` Two classes remain open.
[F-04](#f-04): a file name still forms a competing street package, which is now the whole of the
remaining tray load. And [F-14](#f-14): run A still strands one job in `dedup_check`, which is why
the harness waits out its full 180 s settle deadline — that became reachable at curated size with
[F-02](#f-02)'s fix, not with this one, and it is unchanged here. `[A]`

---

### F-04 · Ordinary file names form competing street-level layer packages {#f-04}

**What happens.** `foto.jpg`, `Abnahmeprotokoll.pdf` and `Kopie von IMG_1274.jpg` each build a
filename layer package that conflicts with the folder package, which opens a `layer_package` tray.
`[A]`

```
  layer packages: at/4020/landstraße 7→{"street":"Landstraße","houseNumber":"7",…}
                | __filename__→{"street":"foto",…}
  package conflict: layer|at/4020/landstraße 7|__filename__:filename: foto|…
```

**Why.** `isWeakFilenameStreetLevel` (`upload-search-object.layer-map.ts:89-98`) rejects only
`^img_\d+$`, a bare `img`, and a bare `file`. `[A]` Everything else with any text becomes a
candidate street.

**Consequence.** Medium rather than High because the tray merges by conflict signature, so a
thousand files named `foto.jpg` under one folder ask once — but a document named after its content,
which is the normal case for a report, always asks. `[A]`

**Fix, 2026-09-13** (the [evidence model](../specs/service/media-upload-service/upload-search-object.evidence-model.md)).
A leftover word is **weak** evidence: it stays in `sources` so a tray can still show it, but it never
becomes the flat `street` and never forms an address package. Street evidence counts as strong only
with a street suffix or keyword, with the `str`/`str.` abbreviation, or from a house number standing
beside it in a segment that is not noise — and never for a camera label (`IMG_1`). A package now
requires a street, since a lone house number describes a position on a street nobody named. Street
values are compared after folding `str.` ≡ `straße` and `ß` ≡ `ss`, so one street spelled two ways is
not a question.

Measured on the curated corpus: tray questions **12 → 4**, complete **5 → 13**, groups **11** instead
of 15 — `AT/Wien/1090/Währinger Straße 12` is one group of four files again instead of three groups.
`[A]` At 500 generated paths: `layer_conflict` **229 → 128**, `branch_a` **214 → 230**, trays
**237 → 191**, and 75 groups that used to ask which junk string was the street now report no address
at all, which is the honest answer. `[A]` The three remaining curated trays are all real questions:
two city contradictions and one genuine house-number disagreement (`Annenstraße 10` folder vs
`Annenstraße 12` file name).

---

### F-05 · `locationRequirementMode: 'optional'` does not skip the address pipeline {#f-05}

**What happens.** Submitting a folder with `locationRequirementMode: 'optional'` still parks 13 of
15 files in `awaiting_disambiguation` **before hashing**. `[A]` — harness run C.

**Why.** `classifyBatch` is awaited unconditionally in all three submit paths
(`upload-manager-submit.util.ts:67`, `:142`, `:195`) and its layer/admin trays gate the jobs. `[A]`
Only the per-job geocode step reads the mode, at `upload-new-pre-resolve.util.ts:320`. `[A]`

**The divergence.** `upload-address-resolution.phases.md` § Trigger matrix states
`locationRequirementMode === optional` → **"Skip pipeline"**. `[A]` It does not skip it.

**Consequence.** The one escape hatch for "just get these files in" does not escape. `[A]` It is
listed as Medium because the flat multi-file path (`submit`) does behave as intended — 150 files
uploaded 142 rows and skipped 8 duplicates with no questions. `[A]`

---

### F-06 · Classification costs ~9 ms per file and blocks the first upload {#f-06}

**Measurement.** `9.82` / `9.48` / `9.59` ms per file at 1 000 / 5 000 / 20 000 paths — linear, and
dominated by the gazetteer. `[B]` (real classifier, synthetic paths, one core, Node + jsdom; a
browser on a field laptop will not be faster.)

**Where it goes.** `path-token-classifier.ts:86` constructs `new Fuse(items, …)` **per candidate
token**, then searches 2 114 municipalities across two keys. Measured separately: building the index
1.06 ms, running the search 2.75 ms. `[B]` So caching the index recovers ~30 %; the fuzzy search is
the remainder.

**Why it is time-to-first-byte, not background work.** `submitUploadManagerWebkitFolder` awaits
`runClassifyBatchGuarded(batchId, deps)` at `upload-manager-submit.util.ts:195` and only then calls
`deps.drainQueue()` at `:196`. `[A]` Nothing uploads until the whole tree is classified, and the
work is synchronous on the main thread.

**Extrapolated** at the measured rate, linear, the optimistic bound: 1.5 min at 10 000 files,
**15 min at 100 000**, 2.5 h at 1 000 000. `[C]`

---

### F-07 · The job store is `O(n)` per write, so a batch is `O(n²)` {#f-07}

**Where.** `upload-job-state.service.ts:126` —
`this._jobs.update((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)))` —
reallocates an array of every job in the batch on **every** field write; `:122` (`findJob`) is a
linear scan. `[A]`

**Measurement**, real `UploadJobStateService`: `[B]`

| Jobs held | `updateJob` | `findJob` |
| --- | --- | --- |
| 100 | 0.0020 ms | 0.0014 ms |
| 1 000 | 0.0164 ms | 0.0130 ms |
| 5 000 | 0.0799 ms | 0.0644 ms |
| 20 000 | 0.5732 ms | 0.3829 ms |

**Writes per job**, counted rather than assumed by wrapping the injected singleton: **13.9** over a
complete new-upload run. `[A]`

**Extrapolated:** ~43 s of pure job-store work for 10 000 files, **~72 min for 100 000**. `[C]`
Superlinear in practice (allocation and GC), so linear extrapolation understates it.

---

### F-08 · Tray volume scales linearly with the file count {#f-08}

**Measured.** 13 tray questions for 15 files; 137 for 150; 3 728 for 5 000. `[B]` Extrapolated:
~45 000 for 100 000 files. `[C]`

Merging works — the largest single group covered 549 files with one question `[B]` — but with camera
file naming **every** group needs a question, because [F-01](#f-01) puts every file in conflict.
`[B]`

**Why it is a product finding, not only an engineering one.** `[C]` No interaction design answers
45 000 questions. The trays were designed for a batch; a database import needs a different mode —
answer-once-per-folder, defer-all-and-fix-later, or import without location and resolve afterwards.
That is a decision, not a bug fix; see [STUDY-006](./006-upload-pipeline-correction-plan.md) D-04.

---

### F-09 · The `test` gate compiles nothing, so it runs no specs {#f-09}

**What happens.** `node scripts/verify.mjs test` reports `known debt` and exits 0, but the `ng test`
bundle fails to compile, so **zero** specs run. `[A]` Reproduced on a clean checkout of the base
commit with the branch stashed. `[A]`

Seven type errors, all pre-existing and none in the harness: `[A]`

- `upload-address-persist.acceptance.spec.ts:248` — `id` not in
  `Pick<UploadJob, 'groupingKey' | 'titleAddress' | 'locationSourceUsed' | 'batchId'>`
- `upload-new-pre-resolve-dedup-disambiguation.integration.spec.ts:147-148` and others — partial
  object literals assigned to full service types (`UploadQueueService`, `UploadService`)

**Consequence.** Every unit test in the repository is currently unverified by CI, and the gate's own
note says the opposite (see [F-10](#f-10)). `[A]`

**Resolved 2026-09-12** on branch `claude/uploader-pipeline-test-badges-kktrpg`: the seven errors are
fixed without a single `as unknown as` cast, by narrowing four deps types to the members they
actually call (the idiom `upload-dedup-skip.util.ts:11` and `upload-heic-prepare.util.ts:22` already
used) and correcting three test fakes. A structural full fake of `UploadService` or
`UploadQueueService` is impossible without a cast, because their injected fields are private — so
narrowing was the only cast-free route. `[A]` The suite now runs: **1 364 tests across 210 files**.
`[A]` The gate also gained an `evidence` hook so that "did not run" is a hard failure and the
measured counts print on every run. `[A]` What the run then revealed is [F-12](#f-12).

---

### F-10 · Two gate debt notes state numbers that no longer match {#f-10}

**`test`.** The note read "The test bundle now compiles cleanly and all 7 map-shell spec files …
pass." It did not compile. `[A]` Its *count* was right, though — the first run after the bundle was
fixed reported exactly the 34 failing tests the note claimed `[A]`, which is what made the false half
so durable: the number matched, so nobody checked the sentence next to it. Rewritten 2026-09-12 to
state the measured range and to say outright that the measured line below it, not the note, is the
number that counts. `[A]`

**`lint`.** The note records "145 errors + 1038 warnings on main (2026-09-10)". Measured on this
branch's base, with all local changes stashed: **147 errors, 1064 warnings**. `[A]` The ratchet is
therefore stated 2 errors and 26 warnings below its real value, which means the gate would accept 26
new warnings as "no worse than main".

---

### F-12 · The unit suite is order-dependent, so its failure count is not reproducible {#f-12}

**Found while fixing [F-09](#f-09).** Once the bundle compiled again, the suite ran — and gave a
different answer each time.

**Measured**, two identical `npm run --silent test` invocations, unchanged tree, 2026-09-12: `[A]`

| Run | Failing tests | Failing files |
| --- | --- | --- |
| 1 | 34 | 13 |
| 2 | 39 | 14 |

**Mechanism, found 2026-09-13.** It is not chance. With `apps/web/node_modules/.vite` **deleted
before each run**, five consecutive runs gave **39 failures across 14 files, identical every time**.
`[A]` Warm, the same tree alternates 39 / 34 / 39. `[A]` The cached dependency metadata changes the
order in which Vitest assigns spec files to workers, and the suite's cross-file pollution only bites
in some orders. So:

- **CI's number is 39/14**, because a fresh checkout has no cache. `[C]`
- The **34** that the debt note carried since 2026-09-10 was a warm-cache local artifact. `[A]`
- Clearing the cache costs nothing: 52 s cold against 54 s warm. `[A]`

`scripts/verify.mjs` now clears that cache before the test check, so the count is reproducible. That
makes the measurement trustworthy; it does **not** fix the pollution — tracked as
[STUDY-006](./006-upload-pipeline-correction-plan.md) Phase 0.4b.

**What the polluter is not.** `core/upload/upload.service.spec.ts` fails because its mocked
`exifr.gps` returns `undefined`, so the 5 assertions that read EXIF values fail. `[A]` Ruled out by
measurement: all 53 `core/upload` spec files pass together (331 tests) `[A]`; pairing the spec with
each of the two files that overlap it in the failing run — `media-detail-view.ui.spec.ts` and
`login.component.spec.ts` — does not reproduce it, nor does pairing it with
`supabase-runtime-config.spec.ts` or with the six specs that call `vi.restoreAllMocks()` `[A]`; and
`optimizeDeps.exclude` for the exifr entry point changes nothing `[A]`. It needs a larger set than
any pair, which is what makes 0.4b a real task rather than a one-line fix.

The swing is one file: `core/upload/upload.service.spec.ts`, 5 EXIF assertions
(`parseExif() returns coordinates when GPS tags are present` → `expected undefined to deeply equal
{ lat: 37.7749, lng: -122.4194 }` and similar). `[A]` It **passes in isolation**; so does
`core/supabase/supabase-runtime-config.spec.ts`, which fails in every full run. `[A]` Both are
cross-file pollution, not product bugs. `[C]`

**Not caused by the new trace harness.** The same 34 → 39 flip reproduces with
`--exclude='src/app/core/upload/trace/**'`. `[A]`

**Why it matters for the gate.** The soft-check contract is "a debt with a name and a number, and
the number may only go down" (`scripts/verify.mjs` header). A number that moves by 5 between two
runs of the same tree cannot carry that contract: a genuine regression of ≤ 5 tests is
indistinguishable from noise, and any ratchet on it will either block good changes or wave bad ones
through. Root `AGENTS.md` already states the rule this violates — "A flaky test is not a gate — fix
isolation first". `[A]`

**Related history.** The 2026-05-27 diary entry recorded cross-file injector pollution in the upload
specs over a real `LocalGeoDataAdapter` fetch, and `docs/TRAPS.md` § Rejected candidates lists it as
"Resolved, not a standing trap". `[A]` The shape is back, in a different file.

---

### F-15 · A path carrying a complete address twice can yield an empty Search Object {#f-15}

**The path**, supplied by the owner as a realistic case and now scenario S18:

```
Mödling/Wilhelminenstraße 141/Wilhelminenstr 141, 1160 Wien.jpg
```

Two independent, complete-looking addresses: the folders say *Wilhelminenstraße 141* in *Mödling*,
the file name says *Wilhelminenstr 141, 1160 Wien*. They contradict each other on the city — which is
the interesting case, and the one a resolver tray exists for.

**What the pipeline produces.** `[A]` — real builder, real geo assets:

```
flat:            country=null state=null postcode=null city=null street=null houseNumber=141
groupingKey:     |||||141
areaEvidence:   {}
areaConflicts: []
postcodeCandidates:  []
```

Everything is lost except the house number. Three independent rules compose to that: `[A]`

1. **No country token in the path**, so `useAtGeo` is false and the gazetteer is never consulted
   ([F-03](#f-03)). `Mödling` and `Wien` are therefore **not cities** — they fall through to `street`
   fragments at confidence 0.5, and land in `sources` as `street`.
2. **`1160` is classified as nothing at all.** Pass 2 accepts a postcode only once a country is known;
   with no country it is not a postcode, and at four digits it is not a house number either (the
   ≤ 3-digit cap without a country). It is silently dropped — it does not even reach
   `postcodeCandidates`.
3. The remaining street fragments form **three competing layer packages** —
   `Mödling`, `Mödling Wilhelminenstraße` (141), `Wilhelminenstr Wien` (141) — so the package conflict
   fires and the flat `street` stays null pending a tray.

**Consequence.** A file whose name contains a postal address good enough to geocode verbatim
produces an empty Search Object, one tray question, and no city, street or postcode. `[A]` The
`areaEvidence` machinery built exactly for "two cities at different levels" never engages, because
nothing was ever classified as a city. `[A]`

**Why it is filed as Spec.** Every one of the three rules is as written in
`upload-search-object.md`. `[A]` The gap is that they were specified independently and their
composition was never stated, so the spec cannot be read to predict this outcome. Fixing it is
[STUDY-006](./006-upload-pipeline-correction-plan.md) D-03 (country derived from a city match rather
than required as input) plus Phase 2.2; after D-03, `Mödling` and `Wien` both classify, the
`areaEvidence` gets its two entries, and the contradiction becomes the tray question it should
always have been. `[C]`

**Fix, 2026-09-13** (D-03, Phase 2.1 — see [F-03](#f-03)). The same path now produces `[A]`:

```
flat:            country=AT state=Wien postcode=1160 city=Wien houseNumber=141
groupingKey:     adminConflict|city|modling,wien
areaEvidence:   city@[L2:Mödling L0:Wien] country@[L2:AT] state@[L0:Wien] postcode@[L0:1160]
areaConflicts: city
```

`Mödling` derives `AT` at level 2; with a country in hand the file name's `1160` is a postcode and
its `Wien` a city, so the level map holds **both** cities with their levels, the city conflict fires,
and the group goes to `needsAreaResolution` before any geocode — the tray question the owner
expected. The flat `city` is `Wien` because flat fields collapse to the lowest level; that value is
not trusted while the conflict stands. What is still open is the `street`: `Wilhelminenstr` (file
name, confidence 0.5) and `Wilhelminenstraße` (folder, confidence 1) remain two competing layer
packages, which is [F-04](#f-04) / [F-11](#f-11) and Phase 2.2, not this finding. `[A]`

**Model note, since it is easy to misread.** Only the four admin fields
(`country`, `state`, `city`, `postcode`) are stored as a per-field map of level-tagged values —
`areaEvidence[field] = { level, value, source }[]`, where level 0 is the file name. `[A]` Street-level
fields are **not** in that map: they live in `AddressLayerEntry[]`, one whole package per folder
prefix plus one for the file name, and within a package the fragments are **concatenated**
(`Mödling Wilhelminenstraße`) rather than kept as alternatives. `[A]` `sources[]` logs every write with
its confidence but carries **no level**. `[A]` So "every property is a map with levels and possibly
several values" is true for admin fields and false for street-level ones — see `docs/TRAPS.md`
TRAP-016.

---

### F-14 · An async tray gate is overwritten by the hashing step, stranding the job {#f-14}

**What happens.** A job ends up parked in `dedup_check` forever, with a resolver tray open for its
group and nothing left to advance it. `[A]`

**Mechanism.** `UploadLocationSourceConflictService.registerSourceConflictGroupAsync` registers the
group **asynchronously**; by the time it calls `markJobsAwaitingDisambiguation` →
`setPhase(jobId, 'awaiting_disambiguation')`, the job has already moved on to `hashing`. The FSM
reports the edge as illegal and applies it anyway (the documented guard policy), so the job is
briefly `awaiting_disambiguation` — and then hashing's own completion sets `dedup_check`, **erasing
the gate**. The tray still waits for an answer; the job no longer waits for anything. `[C]` — the
mechanism is inferred from the stack (`upload-location-source-conflict.service.ts:183` → `:200` →
`:306` → `upload-location-disambiguation-registration.service.ts:69` → `:93`) plus the resulting
phase; it has not been stepped through.

**Pre-existing, not introduced by Phase 1.** The 5 000-file run on 2026-09-12, before any fix in this
study, ended with `phases: awaiting_disambiguation=4636 complete=350 dedup_check=13 missing_data=1` —
**13 stranded jobs**. `[A]` [F-02](#f-02)'s fix made it reachable in the 17-file curated corpus (one
stranded job), which is how it was finally characterised. `[A]`

**Related — retracted.** This finding first cited `illegal transition hashing → conflict_check` from a
full suite run as a sibling of the same defect. It is not: that line comes from
`upload-phase-transitions.spec.ts` and `upload-job-state.service.transition.spec.ts`, which use that
exact edge as their *example* of an unmapped one. `[A]` No pipeline run produces it, so the family has
one member, and the edge stays out of the map — adding it broke both specs, which is how the mistake
surfaced.

**Why the map edge was not simply added.** Adding `hashing → awaiting_disambiguation` to
`PIPELINE_TRANSITIONS` would silence the assertion without stopping the overwrite — the job would
still strand, and the one signal that found this would be gone. The assertion is telling the truth.
`[D]`

**Fix, 2026-09-13** ([STUDY-006](./006-upload-pipeline-correction-plan.md) Phase 1.7). The hold is now
the job's `disambiguationGroupId` + `resolutionStatus: 'pending'` — never the phase label — per the
[FSM supplement's § Disambiguation hold](../specs/service/media-upload-service/upload-manager.phase-fsm.supplement.md).
Three changes, smallest first:

1. `isHeldForDisambiguation(job)` in `upload-disambiguation-hold.util.ts`, and one `holdJob` exit in
   pre-resolve that re-asserts `awaiting_disambiguation` whenever the hold is set, so a label another
   step overwrote is restored at the park point.
2. Pre-resolve tests the hold at entry and again after the dedup step — the window the registration
   actually lands in.
3. The dedup step no longer relabels a held job (`setPhase('dedup_check')` is skipped; the dedup work
   still runs). Without this the park produced the *reverse* illegal edge,
   `awaiting_disambiguation → dedup_check`, which the Vitest reporter throws on — so the job failed
   with `upload_error` instead of stranding. `[A]` That is what made the edge visible at all.

Only then was `hashing → awaiting_disambiguation` added to the map, as this finding required.

Measured: run A of the curated corpus settles with **0** jobs in an active phase and no
illegal-transition report, where before it spent its full 180 s settle budget with one job stranded in
`dedup_check`. `[A]` Fixing it uncovered [F-16](#f-16), which had to be fixed before the stranding
actually went away.

---

### F-13 · `ng test` never loads `vitest.config.ts`, so its aliases are inert in CI {#f-13}

**What happens.** `apps/web/vitest.config.ts` sets a jsdom environment, `globals`, `css`,
`setupFiles`, and — load-bearing — an alias mapping `heic2any` to
`src/test/mocks/heic2any.mock.ts`. The `@angular/build:unit-test` builder does not read it. `[A]`

**Proof.** Appending `this is not valid typescript at all ((((` to `vitest.config.ts` and running
`npx ng test --watch=false --include=…/upload.service.spec.ts` gives `Tests 46 passed (46)`. `[A]` A
config that is loaded cannot be syntactically invalid and silent. The builder's `--runner-config`
option opts in; `angular.json`'s test block sets only `setupFiles`. `[A]` (The flag takes a path, not
a boolean, on the command line: `--runner-config=true` is read as a file called `true` and fails.
`[A]`)

**Consequence.** Two different configurations for the same specs: `npx vitest run <file>` applies the
alias and `npm run test` does not, so a HEIC spec can exercise the real `heic2any` in CI and the mock
locally, or the reverse. `[C]` `environment: 'jsdom'` and the setup file happen to match what the
builder does anyway, which is why nothing looked broken. `[A]`

**Not fixed here.** Passing `--runner-config` would change the configuration for all 210 spec files
at once; that deserves its own measurement rather than a footnote in a gate fix. `[D]`

---

### F-11 · A meaningless folder segment outranks a valid address in the file name {#f-11}

**What happens.** `Baustelle Nord/Mühlenstraße 12.jpg` — a real street and house number in the file
name, a folder that carries no address — produces a flat Search Object with **no street**:
`groupingKey` is `|||||12`, and the job stops in a `layer_package` tray. `[A]`

```
  search object fields: hn=12
    street       = Baustelle                ← folder (conf 0.5)
    street       = Nord                     ← folder (conf 0.5)
    street       = Mühlenstraße             ← filename (conf 1)
    houseNumber  = 12                       ← filename (conf 1)
    groupingKey: |||||12
  layer packages: baustelle nord→{"street":"Baustelle Nord",…} | __filename__→{"street":"Mühlenstraße","houseNumber":"12",…}
  package conflict: layer|baustelle nord|__filename__:filename: muhlenstraße 12|baustelle nord:folder: baustelle nord
```

**Why.** `Baustelle Nord` has no street keyword and no gazetteer match, so its tokens fall through to
`street` fragments at confidence 0.5 (`path-token-classifier.ts` pass 1, last rule). `[A]` That makes
the folder a street-level layer package, which then competes with the file name's package, so
`detectPackageConflicts` reports a conflict and the flat collapse keeps neither street. `[A]`

**Same file without the folder.** Submitted through the flat multi-file path, where `relativePath` is
just the leaf, the identical file resolves cleanly: `groupingKey = ||||muhlenstraße|12`, phase
`complete`. `[A]` So the parse is right; the folder destroys it.

**Consequence.** The owner's stated requirement — a street in the file name must land on the search
object — holds for the *layer package* but **not for the flat Search Object**, whenever any folder
segment parses as a street fragment. `Baustelle Nord`, `Rohdaten`, `Woche 12` and `Kamera A` all do.
`[A]` Recovery exists (the tray offers the file-name package as an option) but costs a question per
distinct folder/file-name pair. `[A]`

**Fix, 2026-09-13** — the same change as [F-04](#f-04): `Baustelle Nord` is weak evidence and no
longer forms a package, so the file name's real street wins without a question. The owner's path now
resolves to `street=Mühlenstraße hn=12`, `groupingKey ||||muhlenstraße|12`, phase `complete`, and
`Baustelle Nord/1090 Mühlenstraße 12.jpg` joins the same group. `[A]` The flat Search Object also
stopped being a *concatenation* of leftovers in the process: it used to read
`street = "Baustelle Nord Mühlenstraße"`, which is what made the field look arbitrary.

**Relation to [F-04](#f-04).** Same mechanism, worse consequence, and the reason F-04's severity is
understated: F-04 records the extra question, F-11 records that the correct answer is dropped from
the object in the meantime.

---

### F-16 · One held job in a resolved group holds every job in it {#f-16}

**What happens.** `AT/Wien/1010/Kärntner Straße 4/Top 3/IMG_6001.jpg` (S09) never uploads. It sits in
`dedup_check` forever with coordinates already resolved, a full Search Object, and no tray of its own.
`[A]` It is the job [F-14](#f-14) was chasing, and it survived F-14's fix.

**Why.** One geocode serves a whole group, so `handleResolvedPreResolve`
(`upload-location-pre-resolve-orchestrator.service.ts`) loops over `groupState.jobIds` applying the
candidate. The loop returned `'held'` to its caller **the moment any job in the group was held** by
`finalizePlacementForJob` — and the caller is one specific job's pipeline run. `[A]` So S09 inherited
the verdict of its sibling S13, whose EXIF is 200 km from its folder address and which therefore *does*
belong in a source-conflict tray. Two consequences from the one `return`: the asking job is parked
without a hold of its own (nothing will ever resume it — its `disambiguationGroupId` is unset), and the
loop exits early, so jobs after the held one never get the group's placement at all. `[A]`

Source conflicts are per job by construction: `isJobEligibleForSourceConflictGroup` requires **both** a
text pin and an EXIF pin (`upload-location-precedence.helpers.ts:130`). `[A]` S09 has no EXIF, so it was
never in that tray's scope — `collectSourceConflictJobIds` had already excluded it.

**Fix, 2026-09-13.** The loop records whether the **asking** job was held and runs to the end
regardless; every job in the group gets the candidate, and the verdict belongs to the caller.
Red-first, three cases in `upload-location-pre-resolve-orchestrator.service.spec.ts`: the unheld job
reports `continue`, the held job reports `held`, and the candidate reaches both jobs. Two of the three
were red. `[A]` Run A then settled with 0 jobs in an active phase and S09 uploaded. `[A]`

---

### F-17 · A parked job keeps its content-hash reservation {#f-17}

**What happens.** A job parked in a resolver tray has already computed and **reserved** its content
hash in the in-flight dedup registry. The reservation is released only when the job reaches a terminal
phase (`upload-job-state.service.ts` — `transitionTo` unregisters on `TERMINAL_PHASES`). `[A]`
`awaiting_disambiguation` is not terminal, so while the user thinks about one tray, a *different* file
with the same bytes is auto-skipped as a duplicate — of a file that was never uploaded. `[C]`

**Evidence.** `[A]` Run B of the trace (18 flat files, one deliberate duplicate pair) skips **1** file
when run alone and **2** when it runs after run A, and the second skip is S13 — whose hash is unique in
the corpus. S13 is the file run A parks in a source-conflict tray. The hashes are identical in both
orderings, so the extra skip is the reservation, not the content.

**What is not settled.** `[C]` Whether the leak in the harness is exactly the production mechanism. The
registry is module-global and the trace spec clears it per test, so run A's reservation must be landing
after run B cleared it — i.e. the dedup step keeps running after the job is parked, which the harness's
settle check does not wait for (it watches phases, and a parked job looks settled). Fixing this needs
its own change: decide whether parking releases the reservation, or whether the reservation is what
resumes the duplicate later. Until then, **read run B's second skip as this artifact**, not as a second
duplicate in the corpus.

---

## What this study could not prove

- **Nothing here was observed against a real Supabase project or a real Photon instance.** `[A]`
  RLS, triggers, constraints, `address_dedupe_key` uniqueness and PostGIS are all absent from the
  harness, and real geocoding ranks fuzzily where the stub is exact. A path that auto-resolves in
  the harness can still land in a tray in production, and the reverse.
- **The timing numbers are Node + jsdom on one core**, not a browser on a site laptop. `[A]` They
  establish the shape of the curve and the hot spots, not the absolute wall time a customer sees.
- **Branch B (street + project centroid bias) was never exercised**, because the harness returns no
  project locations. `[A]`
- **No user research backs [F-08](#f-08)'s claim that 45 000 questions is unusable.** `[C]`
- **File-name and folder conventions in the corpus are invented.** `[A]` What real customer archives
  look like — how many files, how deep, how they are named — is unmeasured, and it decides how much
  [F-01](#f-01) and [F-03](#f-03) actually cost. Settling it needs one real exported folder tree.
