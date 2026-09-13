/**
 * UploadPhase FSM — transition map, terminal set, and idempotency rules.
 *
 * @see docs/specs/service/media-upload-service/upload-manager.phase-fsm.supplement.md
 * @see docs/audits/upload-flow-review-2026-09-10/06-improvement-plan.md item 3 (UP-11)
 */

import type { UploadPhase } from '../upload-manager.types';

/** Job phases that leave the active queue (no further pipeline work unless user/system resurrects). */
export const TERMINAL_PHASES: ReadonlySet<UploadPhase> = new Set([
  'complete',
  'error',
  'missing_data',
  'skipped',
]);

/** Phases with ongoing background work (batch active-count semantics). */
export const ACTIVE_PHASES: ReadonlySet<UploadPhase> = new Set([
  'validating',
  'parsing_exif',
  'converting_format',
  'hashing',
  'dedup_check',
  'extracting_title',
  'resolving_location',
  'conflict_check',
  'uploading',
  'saving_record',
  'replacing_record',
  'resolving_address',
  'resolving_coordinates',
]);

export type TransitionChannel = 'pipeline' | 'user' | 'system';

export type PhaseTransitionOptions = {
  channel: TransitionChannel;
  /** Diagnostic string for violation reports (tests / dev). */
  reason?: string;
};

function edge(from: UploadPhase, to: UploadPhase): string {
  return `${from}->${to}`;
}

/**
 * Pipeline-driven edges inventory-derived from `setPhase` writers in core/upload/**.
 * Mode-specific skips (e.g. `converting_format` only for HEIC, `saving_record` new-only)
 * are optional branches — never illegal jumps.
 */
const PIPELINE_TRANSITIONS: ReadonlySet<string> = new Set([
  // Queue entry + resume shortcuts
  edge('queued', 'validating'),
  edge('queued', 'uploading'),
  edge('queued', 'awaiting_disambiguation'),
  edge('queued', 'complete'),

  // Prepare
  edge('validating', 'parsing_exif'),
  edge('parsing_exif', 'extracting_title'),
  edge('parsing_exif', 'hashing'),
  edge('parsing_exif', 'converting_format'),
  edge('parsing_exif', 'dedup_check'),

  // HEIC + hash + dedup
  edge('converting_format', 'hashing'),
  edge('converting_format', 'dedup_check'),
  edge('converting_format', 'uploading'),
  edge('hashing', 'dedup_check'),
  edge('hashing', 'resolving_location'),
  // F-14: a tray group is registered asynchronously, so it can land while the job is inside the
  // hashing await. The hold, not the label, is what keeps the job parked (see the FSM supplement),
  // so this edge is pipeline structure rather than the map gap it used to stand in for.
  edge('hashing', 'awaiting_disambiguation'),
  edge('dedup_check', 'hashing'),
  edge('dedup_check', 'converting_format'),
  edge('dedup_check', 'uploading'),
  edge('dedup_check', 'skipped'),
  edge('dedup_check', 'missing_data'),
  // NF-38: dedup runs before location resolution — post-dedup placement + routing
  edge('dedup_check', 'resolving_location'),
  edge('dedup_check', 'awaiting_disambiguation'),
  edge('dedup_check', 'conflict_check'),

  // New-only location / conflict cluster
  edge('extracting_title', 'hashing'),
  edge('extracting_title', 'dedup_check'),
  edge('extracting_title', 'resolving_location'),
  edge('extracting_title', 'missing_data'),
  edge('extracting_title', 'conflict_check'),
  edge('resolving_location', 'awaiting_disambiguation'),
  edge('resolving_location', 'queued'),
  edge('resolving_location', 'missing_data'),
  edge('resolving_location', 'conflict_check'),
  edge('awaiting_disambiguation', 'queued'),
  edge('awaiting_disambiguation', 'resolving_location'),
  edge('awaiting_disambiguation', 'missing_data'),
  edge('conflict_check', 'awaiting_conflict_resolution'),
  edge('conflict_check', 'uploading'),
  // `awaiting_conflict_resolution` is non-terminal, so the user-channel branch of
  // canTransition() falls through to this set rather than USER_TERMINAL_RESURRECTIONS.
  edge('awaiting_conflict_resolution', 'queued'),

  // Upload + persist (new: saving_record; attach/replace: replacing_record)
  edge('uploading', 'saving_record'),
  edge('uploading', 'replacing_record'),
  edge('uploading', 'complete'),
  edge('saving_record', 'complete'),
  edge('saving_record', 'missing_data'),
  edge('saving_record', 'resolving_address'),
  edge('saving_record', 'resolving_coordinates'),
  edge('replacing_record', 'complete'),
  edge('replacing_record', 'resolving_address'),
  edge('replacing_record', 'resolving_coordinates'),

  // Post-save enrichment (new + attach/replace)
  edge('resolving_address', 'complete'),
  edge('resolving_address', 'resolving_coordinates'),
  edge('resolving_coordinates', 'complete'),
  edge('resolving_coordinates', 'missing_data'),
]);

/** User-initiated transitions from terminal phases (retry, force-duplicate, map pick, assign, conflict resolve). */
const USER_TERMINAL_RESURRECTIONS: ReadonlyMap<UploadPhase, ReadonlySet<UploadPhase>> = new Map([
  ['error', new Set<UploadPhase>(['queued'])],
  ['skipped', new Set<UploadPhase>(['queued'])],
  ['missing_data', new Set<UploadPhase>(['queued', 'complete', 'error'])],
]);

const NON_TERMINAL_PHASES: readonly UploadPhase[] = [
  'queued',
  'validating',
  'parsing_exif',
  'converting_format',
  'hashing',
  'dedup_check',
  'extracting_title',
  'resolving_location',
  'awaiting_disambiguation',
  'conflict_check',
  'awaiting_conflict_resolution',
  'uploading',
  'saving_record',
  'replacing_record',
  'resolving_address',
  'resolving_coordinates',
];

export function isIdempotentPhaseTransition(from: UploadPhase, to: UploadPhase): boolean {
  return from === to;
}

/**
 * Idempotency rules (service-side):
 * - Same-phase transition is always permitted (no-op).
 * - `failJob` on a terminal source is a no-op (handled in UploadJobStateService.failJob).
 * - `setPhase` / pipeline `transitionTo` on a terminal source is a no-op.
 * - User/system channels may resurrect from terminal phases per USER_TERMINAL_RESURRECTIONS.
 */
export function canTransition(
  from: UploadPhase,
  to: UploadPhase,
  channel: TransitionChannel,
): boolean {
  if (isIdempotentPhaseTransition(from, to)) {
    return true;
  }

  if (channel === 'pipeline') {
    if (TERMINAL_PHASES.has(from)) {
      return false;
    }
    return PIPELINE_TRANSITIONS.has(edge(from, to));
  }

  if (channel === 'user') {
    if (TERMINAL_PHASES.has(from)) {
      return USER_TERMINAL_RESURRECTIONS.get(from)?.has(to) ?? false;
    }
    if (to === 'error') {
      return true;
    }
    return PIPELINE_TRANSITIONS.has(edge(from, to));
  }

  if (channel === 'system') {
    if (to === 'error' && !TERMINAL_PHASES.has(from)) {
      return true;
    }
    return USER_TERMINAL_RESURRECTIONS.get(from)?.has(to) ?? false;
  }

  return false;
}

let violationReporter: ((detail: string) => void) | undefined;

/** Test hook — assert violations without throwing in production. */
export function setTransitionViolationReporter(reporter: ((detail: string) => void) | undefined): void {
  violationReporter = reporter;
}

export function reportTransitionViolation(
  jobId: string,
  from: UploadPhase,
  to: UploadPhase,
  channel: TransitionChannel,
  reason?: string,
): void {
  const detail = `[upload-phase] illegal transition ${from} → ${to} (channel=${channel}, job=${jobId})${reason ? `: ${reason}` : ''}`;
  violationReporter?.(detail);
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    console.error(detail);
  }
}

/** @internal Test helper — enumerate pipeline edges for property-style checks. */
export function listPipelineTransitions(): ReadonlyArray<{ from: UploadPhase; to: UploadPhase }> {
  return [...PIPELINE_TRANSITIONS].map((key) => {
    const [from, to] = key.split('->') as [UploadPhase, UploadPhase];
    return { from, to };
  });
}

/** @internal Test helper — non-terminal phases for system-cancel coverage. */
export function listNonTerminalPhases(): readonly UploadPhase[] {
  return NON_TERMINAL_PHASES;
}
