/**
 * UploadJobStateService — job CRUD, phase transitions, and event emission.
 *
 * Owns the jobs signal and provides atomic operations for job state management.
 * Emits domain events when jobs change phase, fail, skip, or complete.
 */

import { Injectable, Signal, computed, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  JobPhaseChangedEvent,
  UploadFailedEvent,
  UploadJob,
  UploadPhase,
} from './upload-manager.types';

const TERMINAL_PHASES: ReadonlySet<UploadPhase> = new Set([
  'complete',
  'error',
  'missing_data',
  'skipped',
]);

const ACTIVE_PHASES: ReadonlySet<UploadPhase> = new Set([
  'validating',
  'parsing_exif',
  'hashing',
  'dedup_check',
  'extracting_title',
  'conflict_check',
  'uploading',
  'saving_record',
  'replacing_record',
  'resolving_address',
  'resolving_coordinates',
]);

function phaseLabel(phase: UploadPhase): string {
  switch (phase) {
    case 'queued':
      return 'Queued';
    case 'validating':
      return 'Validating…';
    case 'parsing_exif':
      return 'Reading EXIF…';
    case 'hashing':
      return 'Computing hash…';
    case 'dedup_check':
      return 'Checking duplicates…';
    case 'skipped':
      return 'Already uploaded';
    case 'extracting_title':
      return 'Checking filename…';
    case 'conflict_check':
      return 'Checking conflicts…';
    case 'awaiting_conflict_resolution':
      return 'Waiting for decision…';
    case 'uploading':
      return 'Uploading…';
    case 'saving_record':
      return 'Saving…';
    case 'replacing_record':
      return 'Updating record…';
    case 'resolving_address':
      return 'Resolving address…';
    case 'resolving_coordinates':
      return 'Resolving location…';
    case 'missing_data':
      return 'Missing location';
    case 'complete':
      return 'Uploaded';
    case 'error':
      return 'Failed';
  }
}

export { TERMINAL_PHASES, ACTIVE_PHASES, phaseLabel };

@Injectable({ providedIn: 'root' })
export class UploadJobStateService {
  private readonly _jobs = signal<UploadJob[]>([]);

  readonly jobs: Signal<ReadonlyArray<UploadJob>> = this._jobs.asReadonly();

  readonly activeJobs: Signal<ReadonlyArray<UploadJob>> = computed(() =>
    this._jobs().filter((j) => !TERMINAL_PHASES.has(j.phase)),
  );

  readonly isBusy: Signal<boolean> = computed(() => this.activeJobs().length > 0);

  readonly activeCount: Signal<number> = computed(
    () => this._jobs().filter((j) => ACTIVE_PHASES.has(j.phase)).length,
  );

  // ── Events ─────────────────────────────────────────────────────────────────

  private readonly _jobPhaseChanged$ = new Subject<JobPhaseChangedEvent>();
  private readonly _uploadFailed$ = new Subject<UploadFailedEvent>();

  readonly jobPhaseChanged$: Observable<JobPhaseChangedEvent> =
    this._jobPhaseChanged$.asObservable();
  readonly uploadFailed$: Observable<UploadFailedEvent> = this._uploadFailed$.asObservable();

  // ── Mutations ──────────────────────────────────────────────────────────────

  addJobs(jobs: UploadJob[]): void {
    this._jobs.update((prev) => [...prev, ...jobs]);
  }

  findJob(jobId: string): UploadJob | undefined {
    return this._jobs().find((j) => j.id === jobId);
  }

  updateJob(jobId: string, patch: Partial<UploadJob>): void {
    this._jobs.update((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }

  removeJob(jobId: string): void {
    this._jobs.update((prev) => prev.filter((j) => j.id !== jobId));
  }

  removeTerminalJobs(): void {
    const terminal = this._jobs().filter((j) => TERMINAL_PHASES.has(j.phase));
    for (const j of terminal) {
      if (j.thumbnailUrl && j.phase !== 'complete') {
        URL.revokeObjectURL(j.thumbnailUrl);
      }
    }
    this._jobs.update((prev) => prev.filter((j) => !TERMINAL_PHASES.has(j.phase)));
  }

  setPhase(jobId: string, phase: UploadPhase): void {
    const job = this.findJob(jobId);
    const previousPhase = job?.phase ?? 'queued';
    this.updateJob(jobId, { phase, statusLabel: phaseLabel(phase) });

    if (job) {
      this._jobPhaseChanged$.next({
        jobId,
        batchId: job.batchId,
        previousPhase,
        currentPhase: phase,
        fileName: job.file.name,
      });
    }
  }

  failJob(jobId: string, failedAt: UploadPhase, error: string): void {
    const job = this.findJob(jobId);
    this.updateJob(jobId, {
      phase: 'error',
      statusLabel: phaseLabel('error'),
      error,
      failedAt,
    });
    this._uploadFailed$.next({
      jobId,
      batchId: job?.batchId ?? '',
      phase: failedAt,
      error,
    });
  }

  /** Get current snapshot of all jobs (for batch computations). */
  snapshot(): ReadonlyArray<UploadJob> {
    return this._jobs();
  }
}
