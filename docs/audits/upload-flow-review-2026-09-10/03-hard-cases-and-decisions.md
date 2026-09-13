# 03 — The hard cases, and what we decided

**Compiled:** 2026-09-10 from the specs under `docs/specs/service/media-upload-service/` and `docs/specs/component/upload/`, the diary entries in `docs/ai-diary/`, and the code.

This is a reading list for the decisions that are expensive to revisit. Each entry says what the case is, why it is genuinely hard, what was decided, and **what the decision gives up** — because in almost every case something was given up, and that is the part that gets forgotten first.

Entries marked **undocumented** are decisions the code makes that no spec states. Entries marked **open** are decisions that were made on paper and not yet implemented.

---

## A. Where is the photo?

This is the whole reason the subsystem is large. Four sources can each claim to know the location, and they can all be wrong in different ways: EXIF GPS (precise, but the file may have been moved off the device or the camera clock may be wrong), the folder path (structurally reliable, informally named), the filename (a street and house number, if the parser reads it correctly), and the project the user is uploading into.

### A1 — Project location is not an address fallback

**Case.** The user uploads into project "Arsenalstraße 15" and the photo has no GPS and no readable filename address. The project's address is right there.

**Decision.** Do not use it. A project's `project_locations` centroid is used **only** as a Photon bias for Branch B, never inherited as the media item's address. Stated as an explicit non-goal in [`address-resolution-model.md`](../../specs/service/media-upload-service/address-resolution-model.md) § Explicit non-goals.

**Why it is hard.** A project can span a whole district. Inheriting its address would put a pin on the wrong building and look authoritative doing it.

**Given up.** Photos that *are* obviously in a known project still land in the Issues lane and cost the user a click. The alternative — a plausible-looking wrong pin — was judged worse.

**History.** There used to be a project-address tray step (Step 2). It was removed; the removal was still leaking artefacts as late as 2026-09-10 (P4d), and one comment referencing `project_address_*` survives today (NF-16). Root `AGENTS.md` cites this removal as the repository's canonical example of an incomplete change.

### A2 — Street name with no city, and the street exists in several cities

**Case.** Filename gives `Hauptstraße 12`. There are Hauptstraßen in dozens of Austrian towns.

**Decision.** Ask, but ask *once* and ask about the **discriminating field** — the first field in the ranking `city → municipality → district → state → postcode` that actually differs between the candidates ([`address-resolution-model.md`](../../specs/service/media-upload-service/address-resolution-model.md) § 5a). The user gets numbered options, not a free-text city box.

**Why it is hard.** The naive version asks "which city?" once per file, or shows twelve near-identical full addresses. Both are unusable for a 200-photo folder.

**Given up.** Numbered options only work when Photon returns candidates. On zero hits the flow falls back to a text field (Branch C, 0 hits), which is the one place the user has to type.

### A3 — No street at all

**Case.** The folder says `Wien` and nothing else.

**Decision (2026-03 — superseded in part 2026-09-10).** Place an admin centroid; tier-only Search Objects persist at established precision. Legacy spec used `locationPinEligible = false` as a street-text proxy — **retired** per [area-extent decisions](../../specs/service/media-upload-service/address-resolution-model.area-extent-decisions.supplement.md) Decision 2: map affordances follow `address_precision`; known area uses geocoder bbox (Decision 3). Visual treatment of coarse pins not yet approved.

**Given up.** Two classes of item now exist — pinnable and not — and every consumer of location data has to respect the flag. The alternative was a pin in the middle of Vienna, which is a lie with a coordinate attached. *(Partially revised: city-level items may appear on map once item 15 lands; radius selection uses full containment, not centroid distance.)*

### A4 — EXIF says one thing, the folder says another

**Case.** The folder is `Arsenalstraße 15`; the photo's EXIF GPS is 3 km away because it was AirDropped from a colleague who shot it elsewhere.

**Decision.** Three radii, three different jobs, and the code comments explicitly warn not to conflate them:

| Radius | Default | What it decides |
| --- | --- | --- |
| `exifAssistRadiusMeters` | 80 m | Which of several geocode hits is the right one, and fine-tuning |
| `sourceAgreementRadiusMeters` | 150 m | Beyond this, text and EXIF are declared in conflict → ask the user (class C1) |
| `contextDistanceMaxMeters` | org setting, in km | Hits this far from the job anchor are dropped as unrealistic before anything is classified |

Values at `core/upload/location/upload-location-config.ts:67,69`; the "do not conflate" note at `core/upload/location/upload-location-resolution.helpers.ts:467-470`.

**Given up.** Three tunables in two different places (upload config and org Search Tuning), which is why [`search-tuning.distance-radii-contract.md`](../../specs/service/search/search-tuning.distance-radii-contract.md) had to be written to keep them apart.

### A5 — Folder and filename disagree about what kind of address they hold

**Case.** `.../Wien/1200/Handelskai/IMG_1234.jpg` versus `.../Baustelle Nord/Handelskai 12 Stiege 3.jpg`. Which segments are city, street, house, staircase?

**Decision.** Parse into competing **layer packages**, detect the conflict, and ask **before** calling Photon — the `layer_package` tray is enqueued at the end of `classifyBatch`, and `classifyBatch` must not set `needsGeocode` while a package conflict is open ([`address-resolution-model.md`](../../specs/service/media-upload-service/address-resolution-model.md) § Tray enqueue contract).

**Why it is hard.** Geocoding the wrong interpretation does not fail — it returns a confident, wrong address. The error becomes invisible.

**Given up.** The user is asked a question before seeing any progress on the batch, which feels like an interruption rather than a result.

### A6 — The whole thing is a constraint problem, and it was modelled as one

**Decision.** The resolver tray is **not an address picker**. It is a contradiction resolver over a CSP: address fields are variables, candidate values are domains, and the hierarchy `street ∈ city ∈ state ∈ country` supplies the constraints. It fires only when domains conflict or are empty. Principles, taxonomy (C1–C5, A1–A2, V1–V2) and the propagation lifecycle are in [`contradiction-resolution-model.md`](../../specs/service/media-upload-service/contradiction-resolution-model.md), with the Mackworth/Mulder/Havens hierarchical-arc-consistency paper cited as the pattern source.

Consequences that follow from the model rather than from taste:

- **One question, one variable.** Never a multi-field form.
- **Top-down tier order.** Country before state before city before street.
- **Propagate, then re-check, then ask the next question** — so answering "city = Wien" can silently remove three later questions.
- **Decision scope is the shared constraint, not the file.** The dedup key for a tray question is `(batchId, field, conflicting-value-set)` and explicitly **not** `(batchId, groupingKey)`, precisely so one city answer covers every street under that postcode.

**Given up.** The machinery is heavy for the common case, and the model's own gap list (below) is the price of being explicit about what it does not yet do.

### A7 — Hierarchical completeness is enforced upward

**Decision.** Every stored `locations` row must be complete upward: `door`/`staircase`/`houseNumber` → `street` → (`city` OR `municipality`) → `state` → `country`. Gaps are permitted only at higher tiers, never below a missing parent.

**Given up.** Some real-world inputs cannot be stored as-is and must be reduced to the deepest complete tier.

---

## B. Do we already have this file?

### B1 — What counts as "the same photo"

**Decision.** A content hash of **the first 64 KB plus the file size**, plus (for photos) EXIF GPS, `capturedAt` and `direction`. The **filename is never part of the fingerprint**. Two algorithms: `photo_v1` and `binary_v1` ([`upload-manager-pipeline.dedup-scope.supplement.md`](../../specs/service/media-upload-service/upload-manager-pipeline.dedup-scope.supplement.md) § Hash algorithms).

**Why it is hard.** Hashing whole files is too slow for a folder of 500 photos on a phone; hashing too little collides.

**Given up.** `binary_v1` is genuinely collidable for documents generated from a shared template — same header bytes, same size. The previous audit raised this as UP-37, and the spec is **silent on the truncation**, so the limit is real but undocumented.

### B2 — Same user versus colleague

**Case.** The hash already exists in the org. Skip silently, or ask?

**Decision.** It depends on **who** uploaded it first. Same user → **auto-skip**, `phase = skipped`, "Already uploaded". A colleague → **ask**, `issueKind = duplicate_file`, modal. ([Same supplement](../../specs/service/media-upload-service/upload-manager-pipeline.dedup-scope.supplement.md) § Behavior matrix.)

**Rationale.** The same user re-picking a folder is resume-safety, goal #1 — they want the finished files skipped. A colleague's file is somebody else's decision and the system should not make it for them.

**History.** Two normative specs contradicted each other on this until 2026-09-09: `upload-manager.md` forbade auto-skip while the dedup supplement mandated it, and the code followed the supplement. Resolved in favour of the code (UP-17 / P3).

### B3 — What dedup deliberately does not do

**Decision.** Cross-org dedup: never. Perceptual/near-duplicate detection: no. Content-addressable storage: no. All three are listed as explicit non-goals.

### B4 — Video is deduped; documents are deduped

**Decision.** All three media types dedup — video on identical bytes only (Tier C). Worth stating because the audit's own commissioning plan assumed video was exempt, and it is not.

### B5 — Two open holes in dedup, both found on 2026-09-10

- Replace never retires the hash of the file it replaced, so re-uploading the original is later skipped as a duplicate of a row that no longer contains it (NF-01). Needs a migration: `dedup_hashes` has no DELETE policy.
- The hash is registered only after a successful upload, so two identical files inside the same three-job concurrency window both pass the check (NF-04) — against goal #3, which promises renamed copies are caught **before** the storage write.

---

## C. When do we interrupt the user?

### C1 — The gate is "we cannot decide", not "we are unsure"

**Decision.** Silence is the default. Ask only on a genuine contradiction (two sources disagree) or genuine insufficiency (no source produces anything). Everything else resolves without the user.

### C2 — How many questions may appear at once

**Decision.** Bundle caps: a **5 s** collection window and a maximum of **5 dialogue units** per bundle; the 1A (city) and 1B (house number) steps of the same address count as **one** unit. Constants `PRESENTATION_BUNDLE_WINDOW_MS`, `PRESENTATION_BUNDLE_MAX_DIALOGUE_UNITS` in `core/upload-resolver-tray-orchestrator/adapters/upload-location-tray-producer.adapter.ts`.

**Why it is hard.** Questions arrive as geocodes resolve, at unpredictable times. Showing each one immediately produces a strobing tray; waiting for all of them stalls a large batch.

### C3 — Never move the user's lane out from under them

**Decision.** A P0 rule in [`upload-panel.feedback-triage.md`](../../specs/component/upload/upload-panel.feedback-triage.md): resolving something must **never** auto-switch the panel's lane or tab.

**Status: violated.** Six call sites do exactly that (UP-12, still open). The audit's P9 pass left a pinned failing test for it.

### C4 — Skipping a question

**Decision on paper.** Skip sets an explicit `deferred` status that survives the upload and is actionable later in Media Detail, with the item uploaded but unpinned ([`contradiction-resolution-model.md`](../../specs/service/media-upload-service/contradiction-resolution-model.md) § Deferred resolution contract).

**Status: open (G4).** `UploadResolutionStatus` has no `deferred` member (`core/upload/upload-manager.types.ts:37`); skip writes `failed` plus `pendingPartialLocation`. So the user can defer, but nothing invites them back.

---

## D. Not every file is a photo

### D1 — Documents get a different question

**Case.** A PDF has no GPS and never will.

**Decision.** Route it to `issueKind: 'document_unresolved'` with the prompt "Choose location or project" instead of the photo prompt "Missing location" (`core/upload/pipelines/new/upload-new-prepare-route.util.ts:196-205`).

**Given up.** "Is this a document?" is answered two different ways on two paths that set the same `issueKind` — one uses the MIME type with an extension fallback, the other the raw browser MIME prefix — so a file with an empty reported type can be classified differently depending on which path reaches it (UP-24, still open, with a pinned failing test).

### D2 — HEIC is converted in the browser, before upload

**Decision.** Never store raw HEIC. Convert to JPEG client-side at quality 0.85 via `heic2any`, and refuse to upload if conversion did not produce a JPEG.

**Why it is hard.** iPhone photos are the primary input and HEIC is not usefully renderable downstream.

**Given up, and worth knowing:**
- EXIF is parsed from the **original** before conversion, so the database keeps GPS and capture time — but the stored JPEG itself does not carry them.
- Conversion is the most expensive thing the client does, and it runs in parallel with EXIF parsing to hide the cost.
- The 25 MiB cap is checked against the **original**, and the bucket enforces the same limit on the **converted** file (NF-08).

---

## E. When it goes wrong

### E1 — Cancellation is modelled as `error` plus a flag

**Decision (2026-09-10, P6a).** A cancelled job is `phase: 'error'` with `wasCancelled: true`, not a `cancelled` phase. Taken deliberately in preference to a new phase: with no transition map in existence, adding a phase would have touched `TERMINAL_PHASES`, lane routing and every consumer. Recorded in [`docs/ai-diary/2026-09-10.md`](../../ai-diary/2026-09-10.md) § P6a.

**Given up.** `error` now means two things, and "don't offer Retry on a cancelled job" had to be added as a separate guard rather than falling out of the model.

**What it replaced.** Cancellation used to be detected by running `/cancelled/i` over the user-facing error message — so translating that message would have turned every cancel into a hard failure (UP-08).

### E2 — Enrichment is fire-and-forget by design

**Decision.** The address label, the thumbnail, the dedup-hash registration and the mismatch audit all happen after the row is saved, unawaited, so the user is not made to wait for a reverse geocode.

**Given up.** Silence. The previous audit found **9 of 30 failure modes fail completely silently**, and most of them are on these paths. Three of the four were given rejection handlers on 2026-09-10; attach's dedup insert was missed (NF-06).

### E3 — Twenty phases, and they stay

**Case.** A playbook proposed collapsing the 20-member `UploadPhase` enum to five.

**Decision.** Rejected as stated. All 20 phases are reachable and written from live code, so collapsing them changes what the user sees and what subscribers receive — it is a product decision, not a cleanup. A realistic target is **13–15**, and only after a transition map exists and the branches have tests ([`../upload-process-analysis-2026-09-08/11-proposals.md`](../upload-process-analysis-2026-09-08/11-proposals.md) P12). The playbook that proposed it was archived.

**Still true today.** There is no transition map and no guard function anywhere in the subsystem, which is a standing violation of `.cursor/rules/ui-state-machine.mdc` whose own worked example is the upload queue (UP-11).

### E4 — Test fixtures for the dev tray were kept, not deleted

**Decision (2026-09-10, P4b, asked of the user explicitly).** `mockResolverTray` is genuinely useful for QA, so it was kept — but made real: gated on `!environment.production` *and* swapped for an empty stub in production builds via an `angular.json` `fileReplacements` entry, verified by grepping the built output. It had previously been shipping in the production bundle.

---

## F. Batch behaviour

### F1 — Classify the whole batch before uploading anything

**Decision.** `classifyBatch` runs across all files first, so grouping keys, layer-package conflicts and tray questions are computed once per batch rather than once per file.

**Given up.** A single failure early in the batch has batch-wide consequences. An unguarded rejection in `classifyBatch` used to strand every job in the batch at `queued` with no error at all (UP-13, fixed 2026-09-10).

### F2 — One answer, many files

**Decision.** Grouping is by `groupingKey` (the Search Object fingerprint) for geocoding, and by the conflicting constraint for tray answers. Answering once resolves every file that shares it.

### F3 — A second folder dropped in right after the first asks the same question again

**Case.** The user adds a folder, then "nachschiebt" another with overlapping addresses while the first is still unresolved.

**Status: open, and documented as such.** Disambiguation groups are scoped per `batchId`, so the second batch finds no resolved location yet, runs its own Photon call and opens its own tray for the same physical address — sometimes with different candidate text. The required behaviour (reuse if resolved, merge job ids if still open, via a session-scoped `groupingKey` index) is written out in [`address-resolution-model.md`](../../specs/service/media-upload-service/address-resolution-model.md) § Cross-batch same-address dedup with an unchecked acceptance criterion.

### F4 — Three at a time, in submission order

**Decision.** `MAX_CONCURRENT = 3`, plain FIFO.

**Given up.** "Requeue at front" for a job the user just resolved is documented in three places and **does not exist** — a resolved job waits behind everything queued before it (UP-34, still open).

---

## G. The gap list, as it really stands

[`contradiction-resolution-model.md`](../../specs/service/media-upload-service/contradiction-resolution-model.md) carries five named gaps, G1–G5. Two of them are stale in the direction nobody checks — the code is **ahead** of the spec (NF-14):

| Gap | Spec says | Reality |
| --- | --- | --- |
| G1 sibling-folder conflict | not implemented | not implemented — confirmed |
| G2 fan-out by tier, not by `groupingKey` | not implemented | **implemented** — `areaConflictQueryKey` accumulator, `core/upload/address-resolution/upload-address-resolution.orchestrator.ts:231-244` |
| G3 post-resolution validation probe | not implemented | **implemented** — `registerContainmentCheckGroup`, called from `core/upload/location/upload-location-pre-resolve-orchestrator.service.ts:149`, with tests labelled `G3:` |
| G4 `deferred` lifecycle | not implemented | not implemented — confirmed (see C4) |
| G5 cross-batch dedup | not implemented | not implemented — confirmed (see F3) |

G3's implementation also has a rough edge: its "Enter a different address" option only defers the group, with no address entry behind it (NF-13).

And one contradiction class was specified but never built: **C5, "is this photo in the right project area?"** — `context_distance` exists in the type union and is read in one place, but nothing ever writes it (NF-15).

---

## H. The reversals — decisions that were made twice

The most useful thing in the history is the short list of decisions that were shipped and then taken back. Each one is a place where the obvious answer turned out to be wrong in practice, so each one is a trap for anyone who re-derives it from first principles.

### H1 — Same-user duplicate: attaching the new address to the existing media (shipped, then reverted)

**Case.** A user resumes an interrupted folder upload. The bytes already exist as media item M, filed under address A. The resumed file is filed under address B.

**First decision (2026-06-26).** On a same-user server-side hash match, unconditionally attach address B to M. Rationale: the same photo filed under two site folders should be one media row with two location links, not two rows.

**Reverted (2026-06-29).** Backed out. The client does not know which addresses M already has, so "unconditionally attach" could silently accrete addresses onto an existing item from any resumed upload.

**Where it stands.** Same-user match → **auto-skip only**. The address-union behaviour survives for the *intra-batch* case, where the batch's own classification supplies both addresses and the merge is knowable, with an "address added" toast. The reverted server-side variant is correctly absent from the dedup supplement — the spec was not left describing it.

**Trap.** "One media, many addresses" reads like a settled principle in the media-locations specs. It is settled *there*. It was tried and rejected as an upload-time inference from a server hash match.

### H2 — The project-location tray (specified, built, removed twice)

Removed from the spec on 2026-05-27, and the dead code finally deleted on 2026-09-10. A type comment still referred to its steps until this review (NF-16). The reason it keeps needing removal is A1: once project location is not an address fallback, a tray that asks the user to confirm the project's address has nothing to decide.

### H3 — Collapsing the 20 upload phases (proposed, rejected as premature)

**Case.** An archived playbook recommended collapsing `UploadPhase` from 20 members to about 5.

**Finding that killed it (2026-09-09).** All 20 members are reachable from live code. The collapse is therefore a **behaviour change**, not dead-code deletion: `queued` has 12 writers and `complete` has 8, the paused states deliberately do not hold a concurrency slot, and each phase maps to a distinct user-facing status label.

**Decision.** Rejected until a real transition map exists (UP-11 / proposal P8), because collapsing states without a guard would remove the only thing currently documenting which transitions are legal — the phase names themselves.

### H4 — Source-conflict "Save" applying to the whole folder (behaviour corrected)

**Case (2026-05-27).** Answering a text-vs-EXIF source conflict applied the answer to every job in the folder, including jobs that had only one evidence source and therefore no conflict.

**Correction.** The answer applies to `group.jobIds` only — the jobs that actually have *both* `titleAddressCoords` and `parsedExif.coords`. This is why the affected-media chip count is smaller than the batch size, and it is deliberate: the chip shows true conflicts, not file count.

### H5 — Trays moved off `classifyBatch` for Branch C

**Case (2026-05-27).** Branch C questions were being asked during classification, before any geocoder call — so the user was asked to pick a city before the system knew which cities were candidates.

**Correction.** Geocode-derived trays (city, house, geocode) enqueue only **after** `classifySearchHits`. Only layer-package and admin-level conflicts — which are decidable from the path alone — enqueue during classification. That split is now a hard ordering contract, and it is the reason `classifyBatch` must not set `needsGeocode` while package conflicts are unresolved.

### H6 — Silent binary dedup skip (fixed)

Document duplicates were being auto-skipped without the user seeing it (fixed 2026-07-27). The fix aligns documents with the resume-safety goal without hiding the skip. Recorded here because it is a decision that exists **only** as a commit — no spec states it.

---

## I. Timeline of the corrections

| Date | Event | Area |
| --- | --- | --- |
| 2026-05-26 | `parsedExif.coords` split from `job.coords`; EXIF metadata preserved separately from placement | precedence |
| 2026-05-27 | Project tray removed; Branch C + layer packages introduced; source-conflict Save scope corrected (H4); trays moved off `classifyBatch` (H5) | tray / grouping |
| 2026-06-11 | Dedup moved **before** address resolution; admin-level conflict detection added | dedup order |
| 2026-06-13 | Tray reframed as a contradiction resolver, not an address picker; gaps G1–G5 named | philosophy |
| 2026-06-26 | Intra-batch dedup + "one media, multiple addresses" | dedup |
| 2026-06-26 → 06-29 | Server-side same-user address union **shipped then reverted** (H1) | dedup |
| 2026-07-27 | Silent binary dedup skip fixed (H6) | dedup UX |
| 2026-09-09 | Audit: all 20 phases reachable, collapse rejected (H3); parent-vs-supplement dedup contradiction flagged | FSM / specs |
| 2026-09-09–10 | Cancel/orphan/timeout fixes (P2); `wasCancelled` flag replaces regex; dead tray code deleted | failure semantics |
| 2026-09-10 | This review: attach/replace found to have missed the P2 hardening | failure semantics |

---

## J. Two decisions that are only in the code

Both are load-bearing and neither is written down anywhere.

**The forward-geocode retry defaults to Vienna.** When a free-text hint yields no hits and contains no comma, one retry appends a generic locality anchor — `Wien, Österreich`. For an organization working outside Vienna this biases the retry toward the wrong city rather than failing cleanly. There is no typo table and no per-org anchor.

**EXIF beats a weak filename street.** `isExifAuthoritativeOverWeakFilenameStreet` skips the city tray entirely and takes EXIF placement when the filename's street is low-confidence. This is a precedence rule of the same importance as A2 and A3, it is tested, and the Branch C spec does not mention it.
