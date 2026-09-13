# Contradiction Resolution Model

> **Status:** Active — conceptual parent for all resolver tray scenarios.  
> **Parent:** [address-resolution-model.md](./address-resolution-model.md)  
> **UI:** [upload-resolver-tray.md](../../component/upload/upload-resolver-tray.md)  
> **Code (admin):** `upload-location-area-choice.util.ts`, `upload-area-evidence.helpers.ts`  
> **Code (source):** `upload-location-source-conflict.service.ts`

## Philosophy

The resolver tray is **not** an address picker. It is a **contradiction resolver**: a human-in-the-loop dialogue that fires only when the system cannot decide because evidence sources disagree or are insufficient.

The governing pattern is **Hierarchical Constraint Propagation** (Mackworth, Mulder & Havens 1985 — "Hierarchical Arc Consistency"). The address resolution pipeline is a **Constraint Satisfaction Problem (CSP)** where:

- **Variables** = address fields (`country`, `state`, `city`, `postcode`, `district`, `street`, `houseNumber`, `staircase`, `door`)
- **Domains** = candidate values per variable, collected from folder path segments, filenames, EXIF reverse geocode, and forward geocode hits
- **Constraints** = hierarchical containment rules (`street ∈ city ∈ state ∈ country`) validated against the AT gazetteer, PLZ map, and Photon

When all constraints can be satisfied with a single assignment, the system resolves silently. When they cannot — because domains contain conflicting values or are empty — the system asks the user to **prune one domain** (pick a value), then **propagates** consequences to dependent variables before asking the next question.

### Design principles

| Principle | Meaning |
| --- | --- |
| **One question, one variable** | Each tray card asks about exactly one field. Never a multi-field form. |
| **Top-down resolution order** | Resolve the highest conflicting tier first (country → state → city → postcode → street → houseNumber). Lower-tier questions depend on higher-tier answers. |
| **Propagation before next question** | After the user fixes a variable, re-run constraint checks. If propagation resolves remaining conflicts, skip those questions. |
| **Decision scope = shared prefix** | A decision at tier T applies to all jobs sharing the same values at tiers ≥ T. Example: resolving `postcode 1200 → Wien` applies to all streets under that postcode in that batch. |
| **Validation after propagation** | After propagating, validate containment against the gazetteer. If the combination is invalid (e.g. "Musterstraße" not in "Wien 1200"), open a new validation tray — do not silently persist an impossible address. |
| **Deferred = explicit status** | "Skip" / "Mark for later" sets a `deferred` flag visible in the upload queue and in Media Detail after upload. The user can return to it. |

---

## Evidence sources (inputs to the CSP)

| Source | What it provides | Reliability | Pipeline step |
| --- | --- | --- | --- |
| **Folder path** | Area fields at various folder depth levels (`level 0` = filename parent, `level N` = ancestor) | High for structure, but folder names may be informal or wrong | Step 1 (parse) |
| **Filename** | Street, houseNumber, staircase, door (layer packages) | Medium — parser may misclassify segments | Step 1 (parse) |
| **EXIF GPS** | `lat`, `lng` — precise spatial coordinates from camera | High spatial precision, but may be from a different location (moved file, wrong camera clock) | Step 2 |
| **Photon forward geocode** | Full structured address + coordinates for a text query | Depends on query completeness; may return N ambiguous hits | Step 5 |
| **AT gazetteer** | Bundesländer, Gemeinden, PLZ → city mapping | Authoritative for AT | Step 1 (validation) |
| **EXIF reverse geocode** | Structured address from EXIF coordinates | Depends on Photon coverage at that location | Step 4 |

---

## Contradiction taxonomy

Every tray scenario maps to exactly one contradiction class. The class determines the question structure, resolution scope, and post-resolution behavior.

### Class C — Source contradiction (two sources disagree)

| ID | Phenomenon | Competing sources | Detector | `disambiguationKind` | Question | Impl |
| --- | --- | --- | --- | --- | --- | --- |
| **C1** | Text pin vs EXIF GPS | Folder/filename geocode coords vs EXIF coords | `> sourceAgreementRadiusMeters` (150 m) | `source` | "Photo GPS is far from the folder address. Which location?" | **Done** |
| **C2** | Folder vs filename layers | Folder path layers vs filename-parsed layers | `detectPackageConflicts` | `layer_package` | "Which address information should we use?" | **Done** |
| **C3** | Folder-level admin hierarchy | Different admin values at different folder depth levels for same field | `detectAreaConflicts` | `admin_level_conflict` | "Level N says X, Level M says Y. Which is correct?" | **Done** |
| **C4** | Folder-to-folder sibling | Sibling folders disagree on an area field shared by a common child (e.g. `Wien/` and `St. Pölten/` both contain `1200/Straße`) | Gazetteer containment check after C3 resolution | `admin_level_conflict` (cascading) | "Postcode 1200 is in Wien. Is that correct for these files?" | **Gap G1** |
| **C5** | Placement vs project anchor | Resolved coords far from org project GPS reference | `contextDistanceMaxMeters` (org km cap) | *(deferred — no `disambiguationKind`)* | "Is this photo in the right project area?" | **Distance filter only** — tray deferred indefinitely; see [Deferred backlog](#deferred-backlog-not-in-active-acceptance-criteria) |

### Class A — Ambiguity (one source, multiple valid interpretations)

| ID | Phenomenon | Source | Detector | `disambiguationKind` | Question | Impl |
| --- | --- | --- | --- | --- | --- | --- |
| **A1** | Street exists in N cities | Photon multi-hit, discriminating field differs | `pickDiscriminatingField` | `city_step` / `geocode` | "Which city is {street} in?" | **Done** |
| **A2** | Street found, house number missing | Incomplete Search Object (no `houseNumber`) | Branch C step 5c | `house_step` | "What's the door number for {street}?" | **Done** |

### Class V — Validation failure (post-resolution inconsistency)

| ID | Phenomenon | Trigger | Detector | `disambiguationKind` | Question | Impl |
| --- | --- | --- | --- | --- | --- | --- |
| **V1** | Resolved combination not in gazetteer | After C3/C4 propagation: `street` not found in resolved `city+postcode` | Photon 0-hit for resolved combo | `containment_check` | "{street} was not found in {city} {postcode}. Is this correct, or enter a different address?" | **Done** — `patchContainmentCheckOutcome` + `registerContainmentCheckGroup` |
| **V2** | Post-upload field inconsistency | Media Detail open; forward geocode disagrees with stored fields | `AddressReconciliationService` confidence scoring | *(reconciliation banner, not tray)* | "We found a better match for this address. Apply?" | **Done** (sibling system) |

---

## Constraint propagation lifecycle

```
 ┌──────────────────────────────────────────────────────────┐
 │                    PARSE (Step 1)                        │
 │  Folder path → admin level-map (field → level → value)  │
 │  Filename → layer packages (street, houseNumber, …)     │
 └──────────────┬───────────────────────────────────────────┘
                │
                ▼
 ┌──────────────────────────────────────────────────────────┐
 │              DETECT CONFLICTS (Step 1 cont.)            │
 │  detectAreaConflicts (same field, multiple vals)   │
 │  detectPackageConflicts (folder vs filename layers)      │
 │  gazetteer containment (city ∈ state? postcode → city?)  │
 └──────┬─────────────────────────────┬─────────────────────┘
        │ no conflicts                │ conflicts found
        ▼                             ▼
   needsGeocode               ┌────────────────┐
   (continue to Photon)       │   TRAY CARD    │
                              │ (one question) │
                              └──────┬─────────┘
                                     │ user picks value
                                     ▼
                       ┌──────────────────────────────┐
                       │     PROPAGATE + RECHECK      │
                       │  applySelectionsToSO         │
                       │  detectAreaConflicts    │
                       │  expandPostcodeOnSO           │
                       │  rebuildGroupingKey            │
                       └──────┬───────────────┬────────┘
                              │ still conflicts│ all clear
                              ▼               ▼
                         new TRAY CARD    regroup by new
                         (next field)     groupingKey →
                                          needsGeocode
```

### Resolution scope rules

When a user resolves a contradiction at a given tier, the decision applies to the **widest scope that shares the same constraint violation**:

| Resolved tier | Propagation scope | Example |
| --- | --- | --- |
| `country` | All jobs in batch with conflicting country | Rare |
| `state` | All jobs whose SO has the same conflicting `state` entries | "Niederösterreich" vs "Wien" — all affected jobs |
| `city` | All jobs sharing the same `(postcode, conflicting-city-set)` | "1200" with `{Wien, St. Pölten}` → decision for all streets under 1200 |
| `postcode` | All jobs sharing the same `(city, conflicting-postcode-set)` | Multiple postcodes in same city-folder |

**Critical:** The dedup key for a tray question is `(batchId, field, conflicting-value-set)`, **not** `(batchId, groupingKey)`. This prevents asking the same city question once per street.

### Post-resolution validation gate (Gap G3)

After propagation clears all admin-level conflicts, before proceeding to Photon (Step 5):

1. If `city` and `street` are both set on the resolved SO, run a Photon probe: `street + city + country`
2. If **0 hits**: open a **validation tray** (class V1): "{street} was not found in {city}. Correct the city, or enter a different street?"
3. If **≥1 hit**: proceed normally (Photon Step 5 will handle multi-hit ambiguity via class A1/A2)

This gate prevents the system from silently pushing a user's city choice through to Photon and getting `unresolvable` with no recourse.

---

## Deferred resolution contract (Gap G4)

| Event | Behavior |
| --- | --- |
| User clicks **Skip** on a tray card | Jobs in that group get `resolutionStatus: 'deferred'`; job stays in upload queue with label "Address deferred" |
| All cards in bundle skipped | Bundle flushes; jobs with `deferred` groups proceed to upload **without** location coords (no map pin; precision unset) |
| After upload completes | Deferred jobs appear in Media Detail with a reconciliation hint: "Address needs review" |
| User opens Media Detail for deferred item | `AddressReconciliationService` triggers with relaxed constraints (same as "Try again" flow) |
| Explicit "Resolve now" in upload queue | Re-opens the original tray question for that group (re-register with original candidates) |

---

## Open gaps (implementation required)

| Gap | Title | Description | Related | Priority |
| --- | --- | --- | --- | --- |
| **G2** | Decision scope by tier, not by groupingKey | Admin-level tray registration merges jobs by `areaConflictQueryKey` (`buildAdminConflictSignature`) in `classifyBatch`, not per-street `groupingKey`. Resolution apply still scopes to `group.jobIds` until post-choice regroup. | Propagation scope rules | **Partial** — merge at tray open; full tier fan-out on apply still open |
| **G3** | Post-resolution validation gate | After admin conflict resolution, Photon 0-hit on resolved `(street, city)` opens `containment_check` tray (`patchContainmentCheckOutcome`) instead of silent `partial`. | V1 | **Done** |
| **G4** | Deferred resolution lifecycle | Skip must set an explicit `deferred` status that persists through upload and is actionable in Media Detail | Deferred contract | Medium |
| **G5** | Cross-batch dedup for admin conflicts | Same `(field, conflicting-value-set)` across batches must reuse/merge, not open duplicate trays | Already documented in `address-resolution-model.md` | Medium |

---

## Relationship to sibling resolvers

The upload resolver tray is one of several systems that resolve address contradictions. They share the same conceptual model but operate at different lifecycle stages:

| System | Lifecycle | Contradiction classes | UI |
| --- | --- | --- | --- |
| **Upload resolver tray** | Pre-upload (gate) | C1–C5, A1–A2 | Tray cards in upload dock |
| **Address reconciliation** | Post-upload (detail open) | V2 | Inline banner in Media Detail |
| **Folder import review** | Folder import (review phase) | C1 (filename vs EXIF, 50 m threshold) | Review queue |
| **Manual location edit** | Any time (user-initiated) | None (user is the authority) | Media Detail location section |

All four systems implement the same principle: **the system must not silently persist an address when evidence sources disagree**. The difference is when and how the user is asked.

---

## References

- Mackworth, A. K., Mulder, J. A., & Havens, W. S. (1985). *Hierarchical arc consistency: exploiting structured domains in constraint satisfaction problems.* Computational Intelligence, 1, 118–126. — Foundational pattern for hierarchical domain propagation.
- Graph-based geocoding (Hu et al. 2022, *Computers, Environment and Urban Systems*) — Address components as graph nodes with containment constraints; toponym disambiguation via administrative hierarchy.
- Banjar hierarchical filtering (Darwis et al. 2025, *Engineering, Technology & Applied Science Research*) — Domain-specific rules enforcing administrative hierarchy as post-filter in geocoding; confirms pattern applicability for non-European address systems.

## Acceptance criteria

- [x] G2 (partial): `classifyBatch` merges admin conflicts into one `areaConflictQueryKey` group per `(batchId, field, conflicting-value-set)` — `upload-address-resolution.orchestrator.ts` `adminConflictAccum`; vitest `upload-address-resolution.orchestrator.spec.ts`
- [x] G3: Photon 0-hit after admin resolution opens `containment_check` tray — `patchContainmentCheckOutcome`, `registerContainmentCheckGroup`; vitest `upload-location-tray-flow.service.spec.ts` (`G3:` cases)
- [ ] **G4 (product open)** — Skip → `deferred` status persists through upload and is visible/actionable in Media Detail. **Flagged for product owner:** current code sets `resolutionStatus: 'failed'` + `issueKind: 'address_deferred'` on defer, not a durable `deferred` lifecycle through Media Detail.
- [ ] G5: Cross-batch admin conflict dedup (shared with `address-resolution-model.md` AC)
- [x] `disambiguationKind` union in `upload-manager.types.ts` matches implemented tray kinds only (C5 `context_distance` removed — deferred, not in union)

## Deferred backlog (not in active acceptance criteria)

| ID | Title | Notes |
| --- | --- | --- |
| **G1** | Folder-to-folder sibling detection (C4) | Never built. When sibling folders provide different admin values for a shared child (e.g. `Wien/1200/` vs `St. Pölten/1200/`), tray should scope to `(postcode, conflicting-city-set)`, not per-street. |
| **C5 tray** | `context_distance` Prompt B | Distance filter ships via `contextDistanceMaxMeters`; confirm tray and `registerContextDistanceGroup` were never implemented. See [upload-project-gps-reference.adapter.md](./adapters/upload-project-gps-reference.adapter.md). |
