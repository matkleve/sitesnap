/**
 * UploadBatchService — aggregate progress tracking for upload batches.
 *
 * Owns batch state (signals), computes progress from job states,
 * and emits batch-level events (progress, complete).
 */

import { Injectable, Signal, computed, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  BatchCompleteEvent,
  BatchProgressEvent,
  UploadBatch,
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

@Injectable({ providedIn: 'root' })
export class UploadBatchService {
  private readonly _batches = signal<UploadBatch[]>([]);

  readonly batches: Signal<ReadonlyArray<UploadBatch>> = this._batches.asReadonly();

  readonly activeBatch: Signal<UploadBatch | null> = computed(
    () => this._batches().find((b) => b.status !== 'complete' && b.status !== 'cancelled') ?? null,
  );

  // ── Events ─────────────────────────────────────────────────────────────────

  private readonly _batchProgress$ = new Subject<BatchProgressEvent>();
  private readonly _batchComplete$ = new Subject<BatchCompleteEvent>();

  readonly batchProgress$: Observable<BatchProgressEvent> = this._batchProgress$.asObservable();
  readonly batchComplete$: Observable<BatchCompleteEvent> = this._batchComplete$.asObservable();

  // ── Mutations ──────────────────────────────────────────────────────────────

  addBatch(batch: UploadBatch): void {
    this._batches.update((prev) => [...prev, batch]);
  }

  updateBatch(batchId: string, patch: Partial<UploadBatch>): void {
    this._batches.update((prev) => prev.map((b) => (b.id === batchId ? { ...b, ...patch } : b)));
  }

  findBatch(batchId: string): UploadBatch | undefined {
    return this._batches().find((b) => b.id === batchId);
  }

  // ── Progress computation ───────────────────────────────────────────────────

  /** Recompute and emit batch progress based on current job states. */
  emitBatchProgress(batchId: string, jobs: ReadonlyArray<UploadJob>): void {
    const batch = this._batches().find((b) => b.id === batchId);
    if (!batch) return;

    const batchJobs = jobs.filter((j) => j.batchId === batchId);
    const total = batch.totalFiles || batchJobs.length;
    if (total === 0) return;

    const completed = batchJobs.filter((j) => j.phase === 'complete').length;
    const skipped = batchJobs.filter((j) => j.phase === 'skipped').length;
    const failed = batchJobs.filter((j) => j.phase === 'error').length;
    const active = batchJobs.filter((j) => ACTIVE_PHASES.has(j.phase)).length;
    const terminal = completed + skipped + failed;
    const overallProgress = Math.round((terminal / total) * 100);

    this.updateBatch(batchId, {
      completedFiles: completed,
      skippedFiles: skipped,
      failedFiles: failed,
      overallProgress,
    });

    this._batchProgress$.next({
      batchId,
      label: batch.label,
      overallProgress,
      uploadedPercent: Math.round((completed / total) * 100),
      skippedPercent: Math.round((skipped / total) * 100),
      totalFiles: total,
      completedFiles: completed,
      skippedFiles: skipped,
      failedFiles: failed,
      activeFiles: active,
    });
  }

  /** Check whether all jobs in a batch have reached a terminal state. */
  checkBatchComplete(batchId: string, jobs: ReadonlyArray<UploadJob>): void {
    const batch = this._batches().find((b) => b.id === batchId);
    if (!batch || batch.status === 'complete' || batch.status === 'cancelled') return;

    const batchJobs = jobs.filter((j) => j.batchId === batchId);
    const total = batch.totalFiles || batchJobs.length;
    if (total === 0) return;

    const allTerminal =
      batchJobs.length >= total && batchJobs.every((j) => TERMINAL_PHASES.has(j.phase));
    if (!allTerminal) return;

    const completed = batchJobs.filter((j) => j.phase === 'complete').length;
    const skipped = batchJobs.filter((j) => j.phase === 'skipped').length;
    const failed = batchJobs.filter((j) => j.phase === 'error').length;
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - batch.startedAt.getTime();

    this.updateBatch(batchId, {
      status: 'complete',
      finishedAt,
      completedFiles: completed,
      skippedFiles: skipped,
      failedFiles: failed,
      overallProgress: 100,
    });

    this._batchComplete$.next({
      batchId,
      label: batch.label,
      totalFiles: total,
      completedFiles: completed,
      skippedFiles: skipped,
      failedFiles: failed,
      durationMs,
    });
  }
}
