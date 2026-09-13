---
id: STUDY-006
type: proposal
status: proposed
supersedes: none
corrected-by: none
---

# Upload pipeline — decisions to take, and the plan to correct it

**Written:** 2026-09-12 · **Branch:** `claude/uploader-pipeline-test-badges-kktrpg` at `650f495`
**Findings this answers:** [STUDY-005](./005-upload-pipeline-trace-findings.md) F-01 … F-10.

`status: proposed` means **the study as a whole is not accepted**. Four of its six decisions were
taken by the owner on 2026-09-12 (§ 0); two are still open, and the spec changes they imply have not
landed, so the status stays `proposed` until they do. Per [`STUDY-FORMAT.md`](./STUDY-FORMAT.md) a
`[D]` is a decision, not a fact — including the recommendations in § 1 that nobody has answered yet.

The upload pipeline is **Sensitive** class ([`AGENTS.md`](../../AGENTS.md) § Change Classification):
every step below needs the full ceremony — ownership matrix, FSM tables where state changes,
`/security-review` where a boundary moves, red-test-first, live verification, and a fresh-context
adversarial review by a different agent than the implementer.

---

## 0 · Decisions taken, 2026-09-12

Recorded verbatim in effect, with what each one changed in this document.

| | Owner's answer | Effect |
| --- | --- | --- |
| **D-01** | Street names **do** occur in file names (`Mühlenstraße`) and must land on the Search Object. | Clarifies rather than rejects: "admin field" means only `country`, `state`, `city`, `postcode` (`AreaFieldKey`, `upload-area-evidence.types.ts:6`) `[A]` — street-level fields were never in scope. Recommendation tightened to **A′** below, and the requirement is now pinned by two harness scenarios (S16, S17). It also surfaced [F-11](./005-upload-pipeline-trace-findings.md#f-11), which is the real obstacle to that requirement. |
| **D-02** | Accepted as recommended. | Exact-match-first, bounded fuzzy fallback, **plus** the missing statutory cities in the data. Phase 1.3/1.4 unchanged. |
| **D-03** | Rejected: an organisation may work in Germany *and* Austria, so a home country is the wrong primitive. A country restriction may exist as an **extra option**, but not as the mechanism. | Recommendation replaced — see **D-03 (re-derived)** below. The replacement needs no org setting at all, and the mechanism it restores is already in the tree. |
| **D-05** | Accepted: the spec wins, and generally — **spec first, then code**. | Phase ordering unchanged; the "spec first" rule is now explicit in every phase that touches behaviour. |
| **D-04** | A dedicated **archive-import** mode, as recommended. | Phase 4 is no longer conditional. Its two performance prerequisites (F-06, F-07) stay in Phase 3, which now blocks Phase 4 rather than merely preceding it. |
| **D-06** | Implicit in choosing Phase 0 to start: implemented as recommended. | Done — `verify.mjs` gained the `evidence` hook, a `did not run` result is a hard failure, and the measured counts print every run. |

---

## 1 · Decisions to take first

Four of the ten findings are **spec-level**: the code does what the contract says, so the contract
has to change before the code may. Those cannot be "fixed" by an implementer without this section
being answered.

### D-01 — May a file name write an admin field at all? (F-01)

The spec today says yes: a token matching the country's postcode pattern becomes a postcode
(pass 2), and level 0 — the file name — wins the flat collapse. That turns `IMG_1274.jpg` into
postcode 1274.

| Option | What it means | Cost |
| --- | --- | --- |
| **A — File names never write admin fields** (recommended) `[D]` | `country`, `state`, `city`, `postcode` may only come from folder levels ≥ 1. Street-level fields are unaffected. | Loses the rare case where the file name is the only address carrier (`1090 Währinger Straße 12.jpg`). |
| B — Numeric guard only | Extend `isWeakFilenameStreetLevel`'s idea to numbers: a numeric token in a name matching `^(img\|dsc\|dscn\|p)_?\d+$` is never an admin field. | Narrower fix, still wrong for `Foto 1274.jpg`; a new camera prefix reopens it. |
| C — Folder always outranks file name for admin fields | Keep the parse, change the collapse to prefer the **highest**-confidence folder entry when one exists. | Keeps a bogus value on the SO where no folder entry exists. |
| D — Leave it; make it a tray | Today's behaviour, which is a tray per file. | This is the status quo, and it is what makes 100 % of groups ask a question. |

**Recommendation: A′ — a refinement of A, after the owner's clarification.** `[D]`

> A file name may write a **numeric** admin field — in practice a postcode — **only when the same
> file name also yields a street-level token at confidence ≥ 0.9**. Named admin tokens (`Graz`,
> `Wien`, `AT`) are not gated.
>
> **Narrowed 2026-09-13, during implementation.** The first wording gated *all* admin fields, and an
> existing test objected: `Graz.jpg` under `AT/Wien/` deliberately contributes `city = Graz`
> (`upload-search-object.builder.spec.ts` § records filename-derived admin tokens at level 0) `[A]`.
> Every measured instance of the defect is numeric, and a camera writes `IMG_1274.jpg`, never
> `Graz.jpg` `[C]` — so the narrow gate fixes F-01 without the collateral. The broader wording is
> still available if a filename city later proves harmful.

Scope, stated explicitly because the first draft of this section was read as wider than it is:
"admin field" is `country`, `state`, `city`, `postcode` and nothing else — `AreaFieldKey`,
`upload-area-evidence.types.ts:6`. `[A]` `street`, `houseNumber`, `staircase` and `door` are
street-level fields, live in the layer packages, and are **not touched by any option here**. `[A]`

What A′ decides, case by case: `[C]` (reasoning from the `[A]` evidence in F-01 and F-11)

| File name under a folder naming a country | Today | Under A′ |
| --- | --- | --- |
| `IMG_1274.jpg` | postcode 1274, overriding the folder | no admin field — `^img_\d+$` yields no street package |
| `1090 Mühlenstraße 12.jpg` | postcode 1090 (correct) | postcode 1090 — street package present |
| `Mühlenstraße 12.jpg` | street + house number, no admin field | unchanged |
| `Kopie von IMG_1274.jpg` | postcode 1274 | no admin field — no high-confidence street either |
| `Graz.jpg` | city Graz | city Graz — named tokens are not gated |

Gating on *confidence* rather than on a name pattern is what makes the `Kopie von IMG_1274.jpg` row
work: it needs no list of camera prefixes, so a new prefix cannot reopen the defect. `[C]` The
street-fragment half of the problem is untouched — the filename's low-confidence `IMG` is still
appended to `street`, which is [F-04](./005-upload-pipeline-trace-findings.md#f-04) and stays in
Phase 2.2. `[A]`

**What A′ gives up is smaller than first stated.** Measured on scenario S17: a file-name postcode
under a folder that names no country is **already dropped today**
([F-01 correction](./005-upload-pipeline-trace-findings.md#f-01)). `[A]` The only case A′ removes is a
camera-shaped name under a country-naming folder — which is the defect.

### D-02 — What is the confidence floor for a gazetteer substitution? (F-02)

`Wien` becomes `Schottwien` at 0.992 because the municipality list has no plain `Wien`, and 0.992
clears the spec's 0.98 "write it" bar.

| Option | What it means | Cost |
| --- | --- | --- |
| **A — Exact match first, fuzzy only as fallback, and never across a length gap** (recommended) `[D]` | Consult a normalized exact map before Fuse; when falling back, reject a hit whose length differs from the token by more than a small ratio. `Wien` → `Schottwien` is a 6-character addition and would be rejected. | A genuinely misspelled input may now fail to match instead of matching wrongly. That is the safer direction. |
| B — Fix the data only | Add `Wien` (and the other 22 statutory cities) to `at-gemeinden-bev.json`. | Fixes the instance, not the class — the next absent name substitutes just as confidently. Should be done **as well**, not instead. |
| C — Raise the threshold | Require ≥ 0.995. | Guesswork; `Schottwien` at 0.992 shows how little headroom there is, and a real typo scores lower than a wrong substitution. |

**Recommendation: A + B.** `[D]` A closes the class, B closes the instance, and B alone is a trap
because it looks like a fix.

### D-03 (re-derived) — How is the country established, without assuming one? {#d-03}

**The owner's objection, and why it lands.** The first recommendation was "default the country from
the organisation". An organisation working in Germany *and* Austria has no single home country, so
that primitive is wrong — and a wrong default is worse than none, because it is invisible in the
result. `[D]`

**What the re-derivation found.** The mechanism this needs is already in the repository and the
Search Object path stopped using it. `[A]`

- `CITY_REGISTRY` (`city-registry.const.ts:10`) holds city records that each **carry their own
  country**: `{ name, country, zips, lat, lng, aliases }`, and it contains `Wien` with
  `country: 'AT'`. `[A]`
- `findCityBySegment(segment)` (`location-path-parser.util.ts:50-59`) returns
  `{ city, country }` on an **exact** normalized name-or-alias match — no country needed up front,
  no fuzziness, and it derives the country from the match. `[A]`
- Its only callers are in `location-path-parser.service.ts` `[A]`, which the Search Object spec marks
  **non-normative** ("Legacy narrative parser — **non-normative**; use SO specs above",
  `upload-search-object.md` § Normative index). `[A]` The normative path instead gates the AT-only
  fuzzy gazetteer behind `useAtGeo = countryCode === 'AT'` (`path-token-classifier.ts:210`). `[A]`

So `Graz/Annenstraße 10` fails not because the information is missing, but because the new path
consults a country-scoped dataset that needs the answer as its input. `[C]`

**Recommendation: E — country-carrying exact lookup first, country derived from the match.** `[D]`

1. **Exact match against every country-carrying registry**, before any fuzzy step. A hit sets `city`
   **and derives `country`**. `Graz` → `{ Graz, AT }` with no `AT` segment in the path; `Wien` →
   `{ Wien, AT }`, which also closes [F-02](./005-upload-pipeline-trace-findings.md#f-02) as a side
   effect since the substitution never gets a chance to run.
2. **A name in two countries is not guessed.** Write `city`, leave `country` null, record the
   candidate countries. The existing tray machinery asks, or the geocoder settles it. This is the
   part that makes a DE+AT organisation correct rather than lucky.
3. **Fuzzy only as a bounded fallback** (D-02's rule), and only within the countries still in play.
4. **The org-level country list is the "extra option", and it may only narrow.** It filters the
   candidate set; it never supplies a default and never fills `country` on its own. An org that
   leaves it empty gets the full set.
5. **Provenance on the Search Object**: `country` records whether it was `parsed` from a path token,
   `derived` from a city match, or `narrowed` by the org filter. Without it, step 2 is
   indistinguishable from a guess three months later.

**What this gives up, stated plainly.** `[A]`/`[C]`

- Only Austria has a municipality dataset today (`at-gemeinden-bev.json`, 2 114 records) `[A]`, and
  `CITY_REGISTRY` holds **seven** cities `[A]`. A German folder (`Hamburg/Mühlenstraße 12`) matches
  nothing until DE data is added — honest failure rather than a wrong country, but still a failure.
  `[C]` Postcode patterns already cover DE, CH, IT, FR, GB and US (`postcode-patterns.ts:7-15`) `[A]`,
  so the data is the gap, not the structure.
- **A postcode may never set the country by itself:** AT and CH share `^\d{4}$`
  (`postcode-patterns.ts:8,10`). `[A]` A 4-digit token is ambiguous between two countries, so step 1
  must run on names, with postcodes only confirming a country that is already in play.

**Rejected alternatives**, kept so they are not re-proposed: `[D]`

| | Why not |
| --- | --- |
| Org home country (the original recommendation) | The owner's case — one org, two countries — has no single answer, and the default would be silent. |
| Always consult the AT gazetteer | Assumes Austria for everyone; strictly worse than E in exactly the case E is careful about. |
| Keep requiring `AT` in the path | Undiscoverable; it appears in no UI copy today. `[A]` |

### D-04 — What is the import mode for a company-sized archive? (F-08, F-06, F-07)

45 000 tray questions and ~1.5 h of main-thread work for 100 000 files is not a tuning problem.
`[C]`

| Option | What it means | Cost |
| --- | --- | --- |
| **A — A distinct "archive import" mode** (recommended) `[D]` | Chunked classification that yields, uploads starting immediately, **no trays during import**: everything unresolved lands in Issues, and the user works the Issues lane afterwards with folder-level bulk answers. | A second flow to build and to spec. It is the honest shape: a migration is not an interactive batch. |
| B — Make the existing flow fast enough | Fix F-06 and F-07, keep trays. | Removes the waiting, not the 45 000 questions. |
| C — Cap the batch | Refuse folders over N files and tell the user to split. | Ships fastest, answers the customer's actual request with "no". |

**Recommendation: A**, with B's two performance fixes as its foundation. `[D]` They are needed
either way.

### D-05 — Should `locationRequirementMode: 'optional'` skip classification entirely? (F-05)

| Option | What it means | Cost |
| --- | --- | --- |
| **A — Spec wins: skip `classifyBatch` when optional** (recommended) `[D]` | Matches the trigger matrix; folder uploads behave like the flat multi-file path. | Loses the folder address for files the user later wants placed — mitigated by keeping the parse and storing it as a **hint** without gating. |
| B — Code wins: change the spec to say trays still gate | Documents today's behaviour. | Then the mode does not do what its name says, and the escape hatch has no escape. |
| C — Middle: classify, never gate | Build the SO, write the hints, open no tray. | Keeps the ~9 ms/file cost for an upload that opted out of addressing. |

**Recommendation: A.** `[D]` Whichever is chosen, the divergence must end — one of the two documents
is lying today, and that is the thing that costs a session.

### D-06 — Is the `test` gate allowed to pass while compiling nothing? (F-09, F-10)

| Option | What it means | Cost |
| --- | --- | --- |
| **A — A bundle that does not compile is a hard failure** (recommended) `[D]` | Separate "the suite ran and N tests failed" (soft, ratcheted) from "the suite did not run" (hard). | The gate goes red until the seven type errors are fixed — which is the point. |
| B — Fix the seven errors, leave the gate | Green again, same blindness next time. | It already happened once without anyone noticing. |

**Recommendation: A + fix the seven errors.** `[D]` A ratchet that cannot tell zero tests from all
tests passing is not a ratchet.

---

## 2 · The plan

Ordered so that each phase is independently shippable and each one is verified by something that
was **red first**. Sizes are effort, not calendar.

### Phase 0 — Make the evidence repeatable (no product change)

| Step | Change | Verified by |
| --- | --- | --- |
| 0.1 | Fix the seven type errors that stop the `ng test` bundle compiling (F-09). | `node scripts/verify.mjs test` compiles and reports a real pass/fail count. |
| 0.2 | Split the `test` gate into "did not run" (hard) and "ran with N failures" (soft), per D-06. | Deleting a random type annotation turns the gate red instead of `known debt`. |
| 0.3 | Re-measure and correct the `lint` and `test` debt notes (F-10). | The note matches a fresh measurement on `main`. |
| 0.4a | **Make the count reproducible.** Clear `apps/web/node_modules/.vite` before the test check: warm, the count is 34 or 39 depending on run history; cold it is 39 every time, which is also what CI sees. | Five consecutive cold runs give the same count. **Done 2026-09-13.** |
| 0.4b | **Fix the pollution itself** ([F-12](./005-upload-pipeline-trace-findings.md#f-12)). 14 files pass in isolation and fail in a full run. It reproduces deterministically on a cold cache, so it is now debuggable. Start with `core/upload/upload.service.spec.ts` (mocked `exifr.gps` returns `undefined`) — ruled out already: all 53 upload specs together, each overlapping file pairwise, the `vi.restoreAllMocks()` specs, and `optimizeDeps.exclude`. | The 14 files pass in a full cold run, and the count is 0. |
| 0.5 | **Decide what to do about [F-13](./005-upload-pipeline-trace-findings.md#f-13)** — `ng test` does not load `vitest.config.ts`, so its `heic2any` alias is inert in CI. Either pass `--runner-config` (and measure the effect on all 210 files) or move what matters into `angular.json`. | Whichever is chosen, the two ways of running a spec apply the same configuration. |

**Class:** Standard. **Why first:** every phase below claims a test proves something, and today no
test in the repository runs in CI.

**Status, 2026-09-12:** 0.1 and 0.2 are done on branch
`claude/uploader-pipeline-test-badges-kktrpg` — the suite compiles and runs (1 364 tests, 210 files),
and a `did not run` result is now a hard gate failure with the measured counts printed every run.
0.3 is done for `test` and `lint`. 0.4a is done — the count is now reproducible at 39/14, and the
mechanism turned out to be a build cache changing file order, not chance. **0.4b (the pollution
itself) and 0.5 (F-13) are open**, and both were found by 0.1: they only became visible once the
suite actually ran.

### Phase 1 — Stop writing wrong data (F-01, F-02)

| Step | Change | Verified by |
| --- | --- | --- |
| 1.1 | Amend `upload-search-object.md` per **D-01**: admin fields come from folder levels only. Update the § Admin level map collapse rule and the pass-2 table in the same change. | Spec lint green; the changed rule is quoted in the PR. |
| 1.2 | Implement 1.1 in `path-token-classifier.ts` / `upload-area-evidence.helpers.ts`. | A red-first test: `AT/Wien/1090/Währinger Straße 12/IMG_1274.jpg` keeps postcode 1090, and `IMG_1274`/`IMG_1275` in one folder share a `groupingKey`. |
| 1.3 | Amend the spec per **D-02**: exact-match-first, then bounded fuzzy. | Spec lint green. |
| 1.4 | Implement the normalized exact map in `classifyWithFuse`, and add the 23 statutory cities to `at-gemeinden-bev.json` via `scripts/build-at-gemeinden-bev.mjs` (never by hand). | Red-first: `Wien` classifies as `Wien`; `Schottwien` still classifies as `Schottwien`; a deliberate typo still matches. |
| 1.6 | **[F-11](./005-upload-pipeline-trace-findings.md#f-11)** — a folder segment that yields only low-confidence street fragments must not form a competing street package. This is what makes the owner's `Mühlenstraße` requirement actually hold. | Red-first: S16 `Baustelle Nord/Mühlenstraße 12.jpg` yields `groupingKey` `\|\|\|\|muhlenstraße\|12` through the **folder** path and opens no tray. |
| 1.7 | **[F-14](./005-upload-pipeline-trace-findings.md#f-14)** — an async source-conflict registration writes `awaiting_disambiguation` while the job is in `hashing`; hashing's completion then overwrites it and the job strands in `dedup_check`. Pre-existing (13 stranded in the 5 000-file run before any fix), now reachable in the 17-file corpus. Make the gate authoritative rather than a phase label a later step can erase, and only then reconcile the FSM map. Sensitive: needs the FSM/transition table and its own red test. | A full curated run leaves **0** jobs in an active phase, and no illegal-transition report. |
| 1.5 | Re-run the harness and record the new baseline in the playbook. | `GROUP-SPLIT-WITHIN-FOLDER` and `SO-CITY-NOT-IN-PATH` report zero findings on the curated corpus. |

**Status, 2026-09-13:** 1.1-1.4 and **1.7** are done. 1.7 took three code changes rather than one —
the hold predicate and one park exit, pre-resolve testing the hold at entry and after dedup, and the
dedup step no longer relabelling a held job — and then a fourth defect had to be fixed before the
stranding actually went away: [F-16](./005-upload-pipeline-trace-findings.md#f-16), a group-level loop
returning one job's hold as every job's verdict. Run A of the curated corpus now settles with **0** jobs
in an active phase and no illegal-transition report, which is this phase's acceptance criterion. It also
surfaced [F-17](./005-upload-pipeline-trace-findings.md#f-17) (a parked job keeps its content-hash
reservation), which is **open** and needs its own decision. 1.5 and 1.6 remain open.

**Class:** Sensitive. **Ordering notes:** 1.4's exact map is also ~30 % of F-06's cost, so Phase 1
pays part of Phase 3 forward. `[B]` And D-03's step 1 (exact, country-carrying lookup first) makes the
`Wien` → `Schottwien` substitution unreachable, so 1.3/1.4 and 2.1 overlap — decide during
implementation whether they are one change; if they are, the spec amendment covers both. `[C]`

### Phase 2 — Stop asking avoidable questions (F-03, F-04, F-05)

| Step | Change | Verified by |
| --- | --- | --- |
| 2.1 | Per **D-03 (re-derived)**: put the country-carrying exact lookup in front of the AT-only fuzzy gate, derive `country` from the city match, leave it null on cross-country ambiguity, add `country` provenance (`parsed` / `derived` / `narrowed`). Spec first. The org country list is a **later, optional** narrowing filter — not part of this step. | Red-first: `Graz/Annenstraße 10/DSC_0001.jpg` yields city `Graz`, country `AT` marked `derived`, and a non-empty `groupingKey`; a name present in two registries leaves `country` null instead of picking one. |
| 2.2 | Widen the weak-filename guard (F-04) so a single-token file name with no house number never forms a street package. | Red-first: `foto.jpg` and `Abnahmeprotokoll.pdf` under an addressed folder open no `layer_package` tray. |
| 2.3 | Resolve **D-05** — make code and `upload-address-resolution.phases.md` agree, in one change. | Red-first: harness run C parks **0** files in `awaiting_disambiguation`. |

**Class:** Sensitive. 2.1 does **not** touch org-scoped settings after all — the org country list
stayed out of it, which is why it needed no security review.

**Status, 2026-09-13:** 2.1 is **done**. Contract first, as decided:
[`upload-search-object.country-derivation.md`](../specs/service/media-upload-service/upload-search-object.country-derivation.md),
then `path-token-classifier.ts` (`exactPlaceHits` / `classifyPlaceToken`),
`findCitiesBySegment` in `location-path-parser.util.ts`, and `countryProvenance` on the Search
Object. Two deviations from the recommendation above, both deliberate:

- **Ambiguity keeps the places.** Step 2 said "write `city`, leave `country` null, record the
  candidate countries". There is no field for candidate countries, and there is already machinery
  for two values of one admin field: every exact hit is written, so a contested name lands as two
  `areaEvidence` entries and `areaConflicts` opens the tray. Identical values collapse to
  one city with no country — which is also correct, and asks nothing it cannot answer.
- **`narrowed` is not a provenance value yet.** Only `parsed` and `derived` exist. The narrowing
  filter adds its own when it lands; an unused enum member would have been a claim the code does
  not keep.

Measured effect is in [F-03](./005-upload-pipeline-trace-findings.md#f-03) and
[F-15](./005-upload-pipeline-trace-findings.md#f-15). **1.7 is now the blocking step**: a curated run
still strands one job in `dedup_check` and the suite exits non-zero on the illegal
`hashing → awaiting_disambiguation` transition. That was already true after 1.3/1.4 — 2.1 neither
caused nor fixed it — but with classification correct it is the last thing between a curated run and
a clean one.

### Phase 3 — Make the size work (F-06, F-07)

| Step | Change | Verified by |
| --- | --- | --- |
| 3.1 | Key `UploadJobStateService` by job id (`Map`) so `updateJob` and `findJob` are `O(1)`; keep the signal for rendering. | Harness scale tier: `updateJob` flat across 100 → 20 000 jobs instead of 0.002 → 0.573 ms. |
| 3.2 | Cache the Fuse index per geo dataset (one index, not one per token). | Scale tier: measurable drop in ms/file; index construction no longer in the profile. |
| 3.3 | Chunk `classifyBatch` so it yields to the event loop, and start the queue after the first chunk instead of the whole tree. | A 5 000-file folder begins uploading in under a second; harness reports first-upload latency. |

**Class:** Sensitive (3.1 is the state store for a stateful service — FSM and idempotency invariants
must be restated). **Note:** 3.1 and 3.2 are independently valuable and independently testable; do
not bundle them.

### Phase 4 — The archive import mode (D-04, accepted)

Only after Phase 3 — its performance work is a prerequisite, not a nicety. Spec first: a new flow,
not a flag:
chunked import, uploads first, no trays during import, everything unresolved to Issues, and
folder-level bulk resolution in the Issues lane afterwards. Needs its own ownership matrix and FSM
table, and a decision about what "done" means for an import that leaves 40 000 items in Issues.

### Not in this plan

- **Rewriting the tray system.** F-08 is a product decision (D-04), and the merging that exists
  already works — one question covered 549 files. `[B]`
- **Touching `address_dedupe_key`, RLS or migrations.** Nothing in STUDY-005 implicates them, and
  the harness cannot see them.
- **Optimising storage or thumbnailing.** Unmeasured by the harness; no evidence either way.

---

## 3 · How each phase gets proven

Per `AGENTS.md` § Red-test-first, a Sensitive change must show the acceptance test **failing before**
and passing after. The harness gives three complementary levels, and a phase should use the
narrowest one that can fail:

| Level | Use it for |
| --- | --- |
| Unit spec next to the changed file | One rule: a token classification, a collapse, a guard. |
| `upload-pipeline-trace.spec.ts` runs A–C | An end-to-end consequence: which lane, which tray, which payload. |
| `--scale=N` tier | A cost claim: ms/file, per-write cost, tray count. |

Plus, on every run, the FSM assertion from `src/test/vitest.setup.ts` — an illegal `UploadPhase`
transition throws — so a green harness run is also evidence the state machine held for the whole
corpus. `[A]`

## 4 · What would change this plan

- **A real customer folder tree.** `[D]` The corpus is invented. One exported archive would settle
  how much F-01 and F-03 actually cost, and could reorder Phases 1 and 2.
- **A measurement in a real browser.** `[D]` The timings are Node + jsdom on one core. If a browser
  is materially slower, Phase 3 moves ahead of Phase 2.
- **Reversing D-01 or D-04.** `[D]` Both are decided (§ 0) — recorded here because a reversal is what
  would reshape the plan: D-01 option D (leave it) deletes Phase 1.2; D-04 option C (cap the batch)
  deletes Phase 4 and most of Phase 3.
- **Registry data for a second country.** `[D]` D-03's step 2 (cross-country ambiguity is asked, not
  guessed) has nothing to be ambiguous about while only Austria has data, so it ships untested until
  DE or CH records exist. Adding them is what turns that branch from designed to verified.
