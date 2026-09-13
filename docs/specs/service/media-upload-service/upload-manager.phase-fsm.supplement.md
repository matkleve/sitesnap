# Upload Manager — Phase FSM (supplement)

> **Parent:** [upload-manager.md](./upload-manager.md)  
> **Implementation:** `apps/web/src/app/core/upload/support/upload-phase-transitions.ts`

## Terminal phases

Jobs in these phases leave the active upload queue until user or system action resurrects them:

| Phase | Meaning |
| --- | --- |
| `complete` | Persisted media row exists; uploaded lane |
| `error` | Hard failure or user cancel (`wasCancelled` distinguishes cancel) |
| `missing_data` | Issues lane — GPS, duplicate review, deferred address, etc. |
| `skipped` | Same-user dedup auto-skip |

## Idempotency rules

| Action | Terminal source | Behavior |
| --- | --- | --- |
| `setPhase` / pipeline `transitionTo` | any terminal | No-op; job unchanged |
| `failJob` | any terminal | No-op; no `uploadFailed$` |
| `transitionTo` same phase | any | No-op |
| User retry | `error` (not `wasCancelled`) | `error → queued` via user channel |
| User cancel | non-terminal | `→ error` via user channel; **no** `uploadFailed$` |
| Sign-out cancel | non-terminal | `→ error` via system channel; **no** `uploadFailed$` |

## Transition channels

| Channel | Writers | `jobPhaseChanged$` |
| --- | --- | --- |
| `pipeline` | Pipeline `setPhase`, dedup, location services | **Yes** |
| `user` | Panel actions (retry, cancel, map pick, assign, conflict resolve, force duplicate) | **No** (preserves pre-UP-11 event gap) |
| `system` | Sign-out mass cancel, persisted missing-data RPC resolution | **No** |

`failJob` remains separate: sets `phase=error`, records `failedAt`, emits `uploadFailed$`.

## Pipeline divergence (mode-specific optional phases)

| Phase | `new` | `attach` / `replace` |
| --- | --- | --- |
| `saving_record` | Yes | No |
| `replacing_record` | No | Yes |
| `extracting_title` | Yes when auto-location enabled | No |
| `resolving_location` … `awaiting_conflict_resolution` | Yes | No |
| `converting_format` | When source is HEIC | When source is HEIC |

Illegal jumps for a given file are avoided by pipeline branching, not by blocking optional phases globally.

## Guard policy

**Terminality is the only hard invariant.** A pipeline-channel transition out of a terminal phase is rejected with no mutation, so a finished job can never be resurrected by background work. `failJob` enforces the same rule independently.

**Every other edge in the map is an assertion, not a permission.** An unmapped non-terminal transition is reported via `reportTransitionViolation` — the Vitest hook in `src/test/vitest.setup.ts` throws, `ngDevMode` logs `console.error` — and then **applied**. The map documents pipeline structure; when the two disagree, the running pipeline is the authority and the map is the bug.

This is deliberate, and the reason is measured: the map shipped wrong on **eight** edges (NF-38 and the conflict-resume edge below). Giving an unreliable map veto power over a Sensitive pipeline produces one of two user-visible failures — a silently stranded job, or a *successful* upload reported as failed, which invites the user to re-upload a file that is already stored. Neither is acceptable; screaming in dev and test while the upload proceeds is.

`setPhase` and `transitionTo` return `boolean`. It is now `false` only for an unknown job id or a terminal source, so callers that own the next pipeline step should treat `false` as "this job is gone", not "retry".

### Post-dedup edges (NF-38)

After `finishPreResolveDedup`, jobs stay in `dedup_check` until location routing advances them. Required: `dedup_check → { resolving_location, awaiting_disambiguation, conflict_check, missing_data }`.

### Disambiguation hold (F-14)

A job waiting for a resolver tray is identified by its **hold**, not by its phase label:

| | |
| --- | --- |
| The hold | `disambiguationGroupId` set **and** `resolutionStatus === 'pending'` |
| The label | `phase = 'awaiting_disambiguation'` — a consequence of the hold, not the hold itself |

Group registration is **asynchronous** (`registerSourceConflictGroupAsync`), so it can land while the
job is mid-pipeline — typically inside the `await` in the hashing step. The next pipeline step then
writes its own phase (`dedup_check`) and the label is gone while the tray still waits. Therefore:

1. A pipeline step that would continue past a location gate **MUST** test the hold, never the label.
2. When it finds the hold, it parks the job: re-assert `phase = 'awaiting_disambiguation'`, mark the
   queue slot done, emit batch progress, drain. Re-asserting is what keeps the label true after
   another step has overwritten it.
3. Work skipped by parking (content hashing, dedup) is not lost: answering the tray re-queues the job
   and pre-resolve runs again, with the hold cleared to `resolved`.
4. Because registration lands mid-step, `hashing → awaiting_disambiguation` is a **legal** pipeline
   edge, not a map gap. It was left out of the map on purpose until the hold became authoritative, so
   that the violation report kept pointing at the stranding; with rule 1 in place the report would
   only hide a race that no longer strands anything. `hashing → conflict_check` stays unmapped — it
   is the example the FSM's own specs use for an unmapped edge, and no pipeline run produces it.

`locationRequirementMode: 'optional'` is unchanged by this: it skips address resolution before the
hold is tested (see [D-05](../../../study/006-upload-pipeline-correction-plan.md), open).

### Conflict resume edge

`awaiting_conflict_resolution` is **non-terminal**, so `USER_TERMINAL_RESURRECTIONS` never covered it and `resolveUploadManagerConflict` could not requeue a job. `awaiting_conflict_resolution → queued` lives in the pipeline edge set, which the user channel falls through to for non-terminal sources.
