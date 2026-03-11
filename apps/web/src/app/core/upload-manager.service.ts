/**
 * UploadManagerService — singleton, application-wide upload pipeline orchestrator.
 *
 * Coordinates the upload lifecycle by delegating to focused sub-services:
 *  - UploadJobStateService: job CRUD, phase transitions, events
 *  - UploadBatchService: batch tracking, progress computation
 *  - UploadQueueService: FIFO concurrency control (max 3)
 *  - UploadNewPipelineService: 'new' upload pipeline
 *  - UploadReplacePipelineService: 'replace' upload pipeline
 *  - UploadAttachPipelineService: 'attach' upload pipeline
 *  - FolderScanService: recursive directory scanning
 *
 * Ground rules:
 *  - providedIn: 'root' — survives component lifecycle.
 *  - Signals for reactive state; Observables for domain events.
 *  - Delegates per-file work to pipeline services; never touches Leaflet.
 *  - Auth change (logout) cancels all active jobs.
 *  - beforeunload warning when uploads are in progress.
 */

import { Injectable, Signal, effect, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { FolderScanService } from './folder-scan.service';
import { SupabaseService } from './supabase.service';
import { UploadAttachPipelineService } from './upload-attach-pipeline.service';
import { UploadBatchService } from './upload-batch.service';
import { TERMINAL_PHASES, UploadJobStateService, phaseLabel } from './upload-job-state.service';
import type { PipelineContext } from './upload-manager.types';
import { UploadNewPipelineService } from './upload-new-pipeline.service';
import { UploadQueueService } from './upload-queue.service';
import { UploadReplacePipelineService } from './upload-replace-pipeline.service';
import type { ExifCoords } from './upload.service';

// ── Re-export types so existing consumers don't need to change imports ──────

export type {
  UploadPhase,
  UploadJobMode,
  UploadJob,
  SubmitOptions,
  ImageUploadedEvent,
  UploadFailedEvent,
  MissingDataEvent,
  UploadSkippedEvent,
  JobPhaseChangedEvent,
  BatchProgressEvent,
  BatchCompleteEvent,
  LocationConflictEvent,
  ImageReplacedEvent,
  ImageAttachedEvent,
  ConflictCandidate,
  ConflictResolution,
  UploadBatch,
  PipelineContext,
} from './upload-manager.types';

import type {
  UploadPhase,
  UploadJobMode,
  UploadJob,
  SubmitOptions,
  ImageUploadedEvent,
  MissingDataEvent,
  UploadSkippedEvent,
  LocationConflictEvent,
  ImageReplacedEvent,
  ImageAttachedEvent,
  ConflictResolution,
  UploadBatch,
  UploadFailedEvent,
  JobPhaseChangedEvent,
  BatchProgressEvent,
  BatchCompleteEvent,
} from './upload-manager.types';

// ── Helpers ────────────────────────────────────────────────────────────────────

export { TERMINAL_PHASES, ACTIVE_PHASES, phaseLabel } from './upload-job-state.service';

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UploadManagerService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly jobState = inject(UploadJobStateService);
  private readonly batchService = inject(UploadBatchService);
  private readonly queue = inject(UploadQueueService);
  private readonly folderScan = inject(FolderScanService);
  private readonly newPipeline = inject(UploadNewPipelineService);
  private readonly replacePipeline = inject(UploadReplacePipelineService);
  private readonly attachPipeline = inject(UploadAttachPipelineService);

  // ── Delegated state ────────────────────────────────────────────────────────

  readonly jobs: Signal<ReadonlyArray<UploadJob>> = this.jobState.jobs;
  readonly activeJobs: Signal<ReadonlyArray<UploadJob>> = this.jobState.activeJobs;
  readonly isBusy: Signal<boolean> = this.jobState.isBusy;
  readonly activeCount: Signal<number> = this.jobState.activeCount;
  readonly batches: Signal<ReadonlyArray<UploadBatch>> = this.batchService.batches;
  readonly activeBatch: Signal<UploadBatch | null> = this.batchService.activeBatch;

  /** Whether the File System Access API is available (Chromium only). */
  readonly isFolderImportSupported = this.folderScan.isSupported;

  // ── Events ─────────────────────────────────────────────────────────────────

  private readonly _imageUploaded$ = new Subject<ImageUploadedEvent>();
  private readonly _missingData$ = new Subject<MissingDataEvent>();
  private readonly _uploadSkipped$ = new Subject<UploadSkippedEvent>();
  private readonly _locationConflict$ = new Subject<LocationConflictEvent>();
  private readonly _imageReplaced$ = new Subject<ImageReplacedEvent>();
  private readonly _imageAttached$ = new Subject<ImageAttachedEvent>();

  readonly imageUploaded$: Observable<ImageUploadedEvent> = this._imageUploaded$.asObservable();
  readonly uploadFailed$: Observable<UploadFailedEvent> = this.jobState.uploadFailed$;
  readonly missingData$: Observable<MissingDataEvent> = this._missingData$.asObservable();
  readonly uploadSkipped$: Observable<UploadSkippedEvent> = this._uploadSkipped$.asObservable();
  readonly jobPhaseChanged$: Observable<JobPhaseChangedEvent> = this.jobState.jobPhaseChanged$;
  readonly batchProgress$: Observable<BatchProgressEvent> = this.batchService.batchProgress$;
  readonly batchComplete$: Observable<BatchCompleteEvent> = this.batchService.batchComplete$;
  readonly locationConflict$: Observable<LocationConflictEvent> =
    this._locationConflict$.asObservable();
  readonly imageReplaced$: Observable<ImageReplacedEvent> = this._imageReplaced$.asObservable();
  readonly imageAttached$: Observable<ImageAttachedEvent> = this._imageAttached$.asObservable();

  // ── Pipeline context ───────────────────────────────────────────────────────

  /** Shared context passed to pipeline services for manager-owned operations. */
  private readonly pipelineCtx: PipelineContext = {
    failJob: (jobId, failedAt, error) => this.failJob(jobId, failedAt, error),
    emitBatchProgress: (batchId) => this.emitBatchProgress(batchId),
    drainQueue: () => this.drainQueue(),
    checkDedupHash: (hash) => this.checkDedupHash(hash),
    emitUploadSkipped: (e) => this._uploadSkipped$.next(e),
    emitImageUploaded: (e) => this._imageUploaded$.next(e),
    emitImageReplaced: (e) => this._imageReplaced$.next(e),
    emitImageAttached: (e) => this._imageAttached$.next(e),
    emitMissingData: (e) => this._missingData$.next(e),
    emitLocationConflict: (e) => this._locationConflict$.next(e),
  };

  // ── beforeunload ───────────────────────────────────────────────────────────

  private readonly beforeUnloadHandler = (e: BeforeUnloadEvent): void => {
    e.preventDefault();
  };

  constructor() {
    // Cancel all active jobs when the user logs out.
    effect(() => {
      const user = this.auth.user();
      if (!user && this.queue.hasRunning()) {
        this.cancelAllActive();
      }
    });

    // Manage beforeunload listener based on busy state.
    effect(() => {
      if (this.isBusy()) {
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
      } else {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      }
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Submit one or more files for upload. Returns immediately.
   * Each file becomes an UploadJob tracked in `jobs`.
   * Files are grouped into a single batch for aggregate tracking.
   *
   * @returns The batch ID for tracking aggregate progress.
   */
  submit(files: File[], options?: SubmitOptions): string {
    const batchId = crypto.randomUUID();
    const label = options?.batchLabel ?? `${files.length} file${files.length === 1 ? '' : 's'}`;

    this.batchService.addBatch({
      id: batchId,
      label,
      totalFiles: files.length,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'uploading',
      startedAt: new Date(),
    });

    const newJobs: UploadJob[] = files.map((file) => ({
      id: crypto.randomUUID(),
      batchId,
      file,
      phase: 'queued' as UploadPhase,
      progress: 0,
      statusLabel: phaseLabel('queued'),
      thumbnailUrl: URL.createObjectURL(file),
      submittedAt: new Date(),
      mode: 'new' as UploadJobMode,
    }));

    this.jobState.addJobs(newJobs);
    this.drainQueue();

    return batchId;
  }

  /**
   * Submit an entire folder for upload via the File System Access API.
   * Recursively scans the directory for supported image types,
   * creates a batch, and feeds files into the pipeline.
   */
  async submitFolder(
    dirHandle: FileSystemDirectoryHandle,
    options?: SubmitOptions,
  ): Promise<string> {
    const batchId = crypto.randomUUID();
    const label = options?.batchLabel ?? dirHandle.name;

    this.batchService.addBatch({
      id: batchId,
      label,
      totalFiles: 0,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'scanning',
      startedAt: new Date(),
    });

    // Recursively scan folder for image files.
    const files = await this.folderScan.scanDirectory(dirHandle, (_file, count) => {
      this.batchService.updateBatch(batchId, { totalFiles: count });
    });

    // Update batch with final count and switch to uploading.
    this.batchService.updateBatch(batchId, {
      totalFiles: files.length,
      label: `${label} \u2014 ${files.length} image${files.length === 1 ? '' : 's'}`,
      status: files.length > 0 ? 'uploading' : 'complete',
    });

    if (files.length === 0) {
      this.batchService.updateBatch(batchId, { finishedAt: new Date() });
      return batchId;
    }

    // Create jobs for all discovered files.
    const newJobs: UploadJob[] = files.map((file) => ({
      id: crypto.randomUUID(),
      batchId,
      file,
      phase: 'queued' as UploadPhase,
      progress: 0,
      statusLabel: phaseLabel('queued'),
      thumbnailUrl: URL.createObjectURL(file),
      submittedAt: new Date(),
      mode: 'new' as UploadJobMode,
    }));

    this.jobState.addJobs(newJobs);
    this.drainQueue();

    return batchId;
  }

  /** Retry a failed job from the beginning. */
  retryJob(jobId: string): void {
    const job = this.jobState.findJob(jobId);
    if (!job || job.phase !== 'error') return;

    this.jobState.updateJob(jobId, {
      phase: 'queued',
      statusLabel: phaseLabel('queued'),
      progress: 0,
      error: undefined,
      failedAt: undefined,
    });
    this.drainQueue();
  }

  /** Remove a terminal job (complete / error / missing_data) from the list. */
  dismissJob(jobId: string): void {
    const job = this.jobState.findJob(jobId);
    if (!job || !TERMINAL_PHASES.has(job.phase)) return;

    if (job.thumbnailUrl && job.phase !== 'complete') {
      URL.revokeObjectURL(job.thumbnailUrl);
    }
    this.jobState.removeJob(jobId);
  }

  /** Remove all terminal jobs from the list. */
  dismissAllCompleted(): void {
    this.jobState.removeTerminalJobs();
  }

  /** Cancel a pending or active job. Cleans up partial storage if needed. */
  cancelJob(jobId: string): void {
    const job = this.jobState.findJob(jobId);
    if (!job || TERMINAL_PHASES.has(job.phase)) return;

    this.queue.markDone(jobId);

    // Attempt to clean up orphaned storage file if upload was already started.
    if (job.storagePath) {
      this.supabase.client.storage.from('images').remove([job.storagePath]);
    }

    this.jobState.updateJob(jobId, {
      phase: 'error',
      statusLabel: 'Cancelled',
      error: 'Upload cancelled by user.',
      failedAt: job.phase,
    });

    this.drainQueue();
  }

  /** Cancel all non-terminal jobs in a batch. */
  cancelBatch(batchId: string): void {
    const batchJobs = this.jobState
      .snapshot()
      .filter((j) => j.batchId === batchId && !TERMINAL_PHASES.has(j.phase));
    for (const job of batchJobs) {
      this.cancelJob(job.id);
    }
    this.batchService.updateBatch(batchId, { status: 'cancelled', finishedAt: new Date() });
  }

  /**
   * Resolve a `missing_data` job by providing manual coordinates.
   * Moves the job back into the upload pipeline (Path A with manual coords).
   */
  placeJob(jobId: string, coords: ExifCoords): void {
    const job = this.jobState.findJob(jobId);
    if (!job || job.phase !== 'missing_data') return;

    this.jobState.updateJob(jobId, {
      phase: 'queued',
      statusLabel: phaseLabel('queued'),
      coords,
    });
    this.drainQueue();
  }

  /**
   * Replace the photo file for an existing image row.
   * Pipeline: validating → hashing → dedup_check → uploading → replacing_record → complete.
   *
   * @param imageId  The existing image UUID whose file is being replaced.
   * @param file     The new photo file.
   * @returns        The job ID for tracking progress.
   */
  replaceFile(imageId: string, file: File): string {
    const batchId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    this.batchService.addBatch({
      id: batchId,
      label: `Replace photo`,
      totalFiles: 1,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'uploading',
      startedAt: new Date(),
    });

    const job: UploadJob = {
      id: jobId,
      batchId,
      file,
      phase: 'queued',
      progress: 0,
      statusLabel: phaseLabel('queued'),
      thumbnailUrl: URL.createObjectURL(file),
      submittedAt: new Date(),
      mode: 'replace',
      targetImageId: imageId,
    };

    this.jobState.addJobs([job]);
    this.drainQueue();
    return jobId;
  }

  /**
   * Upload a photo to an existing image row that has no file (photoless datapoint).
   * Pipeline: validating → parsing_exif → hashing → dedup_check → uploading → replacing_record → enrichment → complete.
   *
   * @param imageId  The existing photoless image UUID.
   * @param file     The photo file to attach.
   * @returns        The job ID for tracking progress.
   */
  attachFile(imageId: string, file: File): string {
    const batchId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    this.batchService.addBatch({
      id: batchId,
      label: `Attach photo`,
      totalFiles: 1,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'uploading',
      startedAt: new Date(),
    });

    const job: UploadJob = {
      id: jobId,
      batchId,
      file,
      phase: 'queued',
      progress: 0,
      statusLabel: phaseLabel('queued'),
      thumbnailUrl: URL.createObjectURL(file),
      submittedAt: new Date(),
      mode: 'attach',
      targetImageId: imageId,
    };

    this.jobState.addJobs([job]);
    this.drainQueue();
    return jobId;
  }

  /**
   * Resolve a location conflict for a paused job.
   * Called when the user responds to the conflict popup.
   * Re-queues the job at the front of the concurrency queue.
   */
  resolveConflict(jobId: string, resolution: ConflictResolution): void {
    const job = this.jobState.findJob(jobId);
    if (!job || job.phase !== 'awaiting_conflict_resolution') return;

    this.jobState.updateJob(jobId, {
      conflictResolution: resolution,
      phase: 'queued',
      statusLabel: phaseLabel('queued'),
    });

    // If attaching to existing row, switch mode accordingly.
    if (resolution === 'attach_replace' || resolution === 'attach_keep') {
      this.jobState.updateJob(jobId, {
        mode: 'attach',
        targetImageId: job.conflictCandidate!.imageId,
      });
    }

    this.drainQueue();
  }

  // ── Pipeline orchestration ─────────────────────────────────────────────────

  /**
   * Start uploads for queued jobs, respecting the MAX_CONCURRENT cap.
   * Called after enqueuing and after each pipeline completion.
   */
  private drainQueue(): void {
    const jobs = this.jobState.snapshot();
    const slotsAvailable = this.queue.availableSlots;
    if (slotsAvailable <= 0) return;

    const queued = jobs.filter((j) => j.phase === 'queued');
    const toStart = queued.slice(0, slotsAvailable);

    for (const job of toStart) {
      this.queue.markRunning(job.id);
      this.runPipeline(job.id);
    }
  }

  /** Runs the full pipeline for one job. Routes by mode. */
  private async runPipeline(jobId: string): Promise<void> {
    try {
      const job = this.jobState.findJob(jobId);
      if (!job) return;

      if (job.mode === 'replace') {
        await this.replacePipeline.run(jobId, this.pipelineCtx);
      } else if (job.mode === 'attach') {
        await this.attachPipeline.run(jobId, this.pipelineCtx);
      } else {
        await this.newPipeline.run(jobId, this.pipelineCtx);
      }
    } catch (err) {
      const current = this.jobState.findJob(jobId);
      this.failJob(
        jobId,
        current?.phase ?? 'queued',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private failJob(jobId: string, failedAt: UploadPhase, error: string): void {
    this.queue.markDone(jobId);
    this.jobState.failJob(jobId, failedAt, error);
    const job = this.jobState.findJob(jobId);
    if (job) {
      this.emitBatchProgress(job.batchId);
    }
    this.drainQueue();
  }

  private cancelAllActive(): void {
    const active = this.jobState.snapshot().filter((j) => !TERMINAL_PHASES.has(j.phase));
    for (const job of active) {
      this.queue.markDone(job.id);
      if (job.storagePath) {
        this.supabase.client.storage.from('images').remove([job.storagePath]);
      }
      this.jobState.updateJob(job.id, {
        phase: 'error',
        statusLabel: 'Cancelled',
        error: 'Upload cancelled \u2014 user signed out.',
        failedAt: job.phase,
      });
    }
  }

  /** Emit batch progress and check for batch completion. */
  private emitBatchProgress(batchId: string): void {
    const jobs = this.jobState.snapshot();
    this.batchService.emitBatchProgress(batchId, jobs);
    this.batchService.checkBatchComplete(batchId, jobs);
  }

  /**
   * Check a single content hash against the server.
   * Returns the existing image ID if found, or null.
   */
  private async checkDedupHash(contentHash: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase.client.rpc('check_dedup_hashes', {
        hashes: [contentHash],
      });
      if (error || !data || data.length === 0) return null;
      return data[0].image_id;
    } catch {
      return null;
    }
  }
}
