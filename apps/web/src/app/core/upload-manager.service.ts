/**
 * UploadManagerService — singleton, application-wide upload pipeline.
 *
 * Owns the full lifecycle: validation, EXIF parsing, title extraction,
 * storage upload, DB insert, and address/coordinate resolution.
 * Any component can call submit() and navigate away — uploads continue
 * as long as the browser tab stays open.
 *
 * Ground rules:
 *  - providedIn: 'root' — survives component lifecycle.
 *  - Maximum 3 concurrent uploads (FIFO queue).
 *  - Signals for reactive state; Observables for domain events.
 *  - Delegates per-file work to UploadService; never touches Leaflet.
 *  - Auth change (logout) cancels all active jobs.
 *  - beforeunload warning when uploads are in progress.
 */

import { Injectable, Signal, computed, effect, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { computeContentHash, readFileHead } from './content-hash.util';
import { GeocodingService } from './geocoding.service';
import { SupabaseService } from './supabase.service';
import { ExifCoords, ParsedExif, UploadService } from './upload.service';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;

/**
 * Camera-generated filename prefixes that carry no address information.
 * Used by extractAddressFromFilename to short-circuit obvious non-addresses.
 */
const CAMERA_PREFIXES = /^(IMG|DSC|DCIM|P|PXL|MVIMG|PANO|VID|MOV|Screenshot)[\s_-]/i;

/** Timestamps like 20260311, 2026-03-11, 20260311_143022, etc. */
const TIMESTAMP_PATTERN = /^\d{4}[-_]?\d{2}[-_]?\d{2}([-_T]\d{2}[-_]?\d{2}[-_]?\d{2})?$/;

/**
 * European street type suffixes recognised for address extraction.
 * Matches in the middle or end of a token sequence.
 */
const STREET_SUFFIXES =
  /(?:stra(?:ß|ss)e|strasse|str\.?|gasse|weg|allee|platz|gässli|ring|damm|ufer|road|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|court|ct\.?|way)\b/i;

// ── Types ──────────────────────────────────────────────────────────────────────

export type UploadPhase =
  | 'queued'
  | 'validating'
  | 'parsing_exif'
  | 'hashing'
  | 'dedup_check'
  | 'skipped'
  | 'extracting_title'
  | 'uploading'
  | 'saving_record'
  | 'resolving_address'
  | 'resolving_coordinates'
  | 'missing_data'
  | 'complete'
  | 'error';

export interface UploadJob {
  id: string;
  batchId: string;
  file: File;
  phase: UploadPhase;
  progress: number;
  statusLabel: string;
  error?: string;
  failedAt?: UploadPhase;
  coords?: ExifCoords;
  titleAddress?: string;
  direction?: number;
  imageId?: string;
  storagePath?: string;
  thumbnailUrl?: string;
  submittedAt: Date;
  /** Cached EXIF parse to avoid re-parsing on retry. */
  parsedExif?: ParsedExif;
  /** Dedup content hash (set after 'hashing' phase). */
  contentHash?: string;
  /** If phase === 'skipped', the existing image ID that matched. */
  existingImageId?: string;
}

export interface SubmitOptions {
  projectId?: string;
  batchLabel?: string;
}

export interface ImageUploadedEvent {
  jobId: string;
  batchId: string;
  imageId: string;
  coords?: ExifCoords;
  direction?: number;
  thumbnailUrl?: string;
}

export interface UploadFailedEvent {
  jobId: string;
  batchId: string;
  phase: UploadPhase;
  error: string;
}

export interface MissingDataEvent {
  jobId: string;
  batchId: string;
  fileName: string;
  reason: 'no_gps_no_address';
}

export interface UploadSkippedEvent {
  jobId: string;
  batchId: string;
  fileName: string;
  contentHash: string;
  existingImageId: string;
}

export interface JobPhaseChangedEvent {
  jobId: string;
  batchId: string;
  previousPhase: UploadPhase;
  currentPhase: UploadPhase;
  fileName: string;
}

export interface BatchProgressEvent {
  batchId: string;
  label: string;
  overallProgress: number;
  uploadedPercent: number;
  skippedPercent: number;
  totalFiles: number;
  completedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  activeFiles: number;
}

export interface BatchCompleteEvent {
  batchId: string;
  label: string;
  totalFiles: number;
  completedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  durationMs: number;
}

/** Tracks aggregate progress for a multi-file submission. */
export interface UploadBatch {
  id: string;
  label: string;
  totalFiles: number;
  completedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  overallProgress: number;
  status: 'scanning' | 'uploading' | 'complete' | 'cancelled';
  startedAt: Date;
  finishedAt?: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TERMINAL_PHASES: ReadonlySet<UploadPhase> = new Set(['complete', 'error', 'missing_data', 'skipped']);

const ACTIVE_PHASES: ReadonlySet<UploadPhase> = new Set([
  'validating',
  'parsing_exif',
  'hashing',
  'dedup_check',
  'extracting_title',
  'uploading',
  'saving_record',
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
    case 'uploading':
      return 'Uploading…';
    case 'saving_record':
      return 'Saving…';
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

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UploadManagerService {
  private readonly uploadService = inject(UploadService);
  private readonly geocoding = inject(GeocodingService);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  // ── State ──────────────────────────────────────────────────────────────────

  private readonly _jobs = signal<UploadJob[]>([]);
  private readonly _batches = signal<UploadBatch[]>([]);

  readonly jobs: Signal<ReadonlyArray<UploadJob>> = this._jobs.asReadonly();

  readonly activeJobs: Signal<ReadonlyArray<UploadJob>> = computed(() =>
    this._jobs().filter((j) => !TERMINAL_PHASES.has(j.phase)),
  );

  readonly isBusy: Signal<boolean> = computed(() => this.activeJobs().length > 0);

  readonly activeCount: Signal<number> = computed(
    () => this._jobs().filter((j) => ACTIVE_PHASES.has(j.phase)).length,
  );

  readonly batches: Signal<ReadonlyArray<UploadBatch>> = this._batches.asReadonly();

  readonly activeBatch: Signal<UploadBatch | null> = computed(
    () => this._batches().find((b) => b.status !== 'complete' && b.status !== 'cancelled') ?? null,
  );

  /** Whether the File System Access API is available (Chromium only). */
  readonly isFolderImportSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // ── Events ─────────────────────────────────────────────────────────────────

  private readonly _imageUploaded$ = new Subject<ImageUploadedEvent>();
  private readonly _uploadFailed$ = new Subject<UploadFailedEvent>();
  private readonly _missingData$ = new Subject<MissingDataEvent>();
  private readonly _uploadSkipped$ = new Subject<UploadSkippedEvent>();
  private readonly _jobPhaseChanged$ = new Subject<JobPhaseChangedEvent>();
  private readonly _batchProgress$ = new Subject<BatchProgressEvent>();
  private readonly _batchComplete$ = new Subject<BatchCompleteEvent>();

  readonly imageUploaded$: Observable<ImageUploadedEvent> = this._imageUploaded$.asObservable();
  readonly uploadFailed$: Observable<UploadFailedEvent> = this._uploadFailed$.asObservable();
  readonly missingData$: Observable<MissingDataEvent> = this._missingData$.asObservable();
  readonly uploadSkipped$: Observable<UploadSkippedEvent> = this._uploadSkipped$.asObservable();
  readonly jobPhaseChanged$: Observable<JobPhaseChangedEvent> = this._jobPhaseChanged$.asObservable();
  readonly batchProgress$: Observable<BatchProgressEvent> = this._batchProgress$.asObservable();
  readonly batchComplete$: Observable<BatchCompleteEvent> = this._batchComplete$.asObservable();

  // ── Concurrency tracking ───────────────────────────────────────────────────

  /** IDs of jobs currently running through the pipeline (not queued, not terminal). */
  private readonly runningIds = new Set<string>();

  // ── beforeunload ───────────────────────────────────────────────────────────

  private readonly beforeUnloadHandler = (e: BeforeUnloadEvent): void => {
    e.preventDefault();
  };

  constructor() {
    // Cancel all active jobs when the user logs out.
    effect(() => {
      const user = this.auth.user();
      if (!user && this.runningIds.size > 0) {
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

    const batch: UploadBatch = {
      id: batchId,
      label,
      totalFiles: files.length,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'uploading',
      startedAt: new Date(),
    };
    this._batches.update((prev) => [...prev, batch]);

    const newJobs: UploadJob[] = files.map((file) => ({
      id: crypto.randomUUID(),
      batchId,
      file,
      phase: 'queued' as UploadPhase,
      progress: 0,
      statusLabel: phaseLabel('queued'),
      thumbnailUrl: URL.createObjectURL(file),
      submittedAt: new Date(),
    }));

    this._jobs.update((prev) => [...prev, ...newJobs]);
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

    const batch: UploadBatch = {
      id: batchId,
      label,
      totalFiles: 0,
      completedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      overallProgress: 0,
      status: 'scanning',
      startedAt: new Date(),
    };
    this._batches.update((prev) => [...prev, batch]);

    // Recursively scan folder for image files.
    const files: File[] = [];
    await this.scanDirectory(dirHandle, files, batchId);

    // Update batch with final count and switch to uploading.
    this.updateBatch(batchId, {
      totalFiles: files.length,
      label: `${label} \u2014 ${files.length} image${files.length === 1 ? '' : 's'}`,
      status: files.length > 0 ? 'uploading' : 'complete',
    });

    if (files.length === 0) {
      this.updateBatch(batchId, { finishedAt: new Date() });
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
    }));

    this._jobs.update((prev) => [...prev, ...newJobs]);
    this.drainQueue();

    return batchId;
  }

  /** Retry a failed job from the beginning. */
  retryJob(jobId: string): void {
    const job = this.findJob(jobId);
    if (!job || job.phase !== 'error') return;

    this.updateJob(jobId, {
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
    const job = this.findJob(jobId);
    if (!job || !TERMINAL_PHASES.has(job.phase)) return;

    if (job.thumbnailUrl && job.phase !== 'complete') {
      URL.revokeObjectURL(job.thumbnailUrl);
    }
    this._jobs.update((prev) => prev.filter((j) => j.id !== jobId));
  }

  /** Remove all terminal jobs from the list. */
  dismissAllCompleted(): void {
    const terminal = this._jobs().filter((j) => TERMINAL_PHASES.has(j.phase));
    for (const j of terminal) {
      if (j.thumbnailUrl && j.phase !== 'complete') {
        URL.revokeObjectURL(j.thumbnailUrl);
      }
    }
    this._jobs.update((prev) => prev.filter((j) => !TERMINAL_PHASES.has(j.phase)));
  }

  /** Cancel a pending or active job. Cleans up partial storage if needed. */
  cancelJob(jobId: string): void {
    const job = this.findJob(jobId);
    if (!job || TERMINAL_PHASES.has(job.phase)) return;

    this.runningIds.delete(jobId);

    // Attempt to clean up orphaned storage file if upload was already started.
    if (job.storagePath) {
      this.supabase.client.storage.from('images').remove([job.storagePath]);
    }

    this.updateJob(jobId, {
      phase: 'error',
      statusLabel: 'Cancelled',
      error: 'Upload cancelled by user.',
      failedAt: job.phase,
    });

    this.drainQueue();
  }

  /** Cancel all non-terminal jobs in a batch. */
  cancelBatch(batchId: string): void {
    const batchJobs = this._jobs().filter(
      (j) => j.batchId === batchId && !TERMINAL_PHASES.has(j.phase),
    );
    for (const job of batchJobs) {
      this.cancelJob(job.id);
    }
    this.updateBatch(batchId, { status: 'cancelled', finishedAt: new Date() });
  }

  /**
   * Resolve a `missing_data` job by providing manual coordinates.
   * Moves the job back into the upload pipeline (Path A with manual coords).
   * This bridges the gap until MissingDataManager is implemented.
   */
  placeJob(jobId: string, coords: ExifCoords): void {
    const job = this.findJob(jobId);
    if (!job || job.phase !== 'missing_data') return;

    this.updateJob(jobId, {
      phase: 'queued',
      statusLabel: phaseLabel('queued'),
      coords,
    });
    this.drainQueue();
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  /**
   * Start uploads for queued jobs, respecting the MAX_CONCURRENT cap.
   * Called after enqueuing and after each pipeline completion.
   */
  private drainQueue(): void {
    const jobs = this._jobs();
    const slotsAvailable = MAX_CONCURRENT - this.runningIds.size;
    if (slotsAvailable <= 0) return;

    const queued = jobs.filter((j) => j.phase === 'queued');
    const toStart = queued.slice(0, slotsAvailable);

    for (const job of toStart) {
      this.runningIds.add(job.id);
      this.runPipeline(job.id);
    }
  }

  /** Runs the full pipeline for one job. */
  private async runPipeline(jobId: string): Promise<void> {
    try {
      const job = this.findJob(jobId);
      if (!job) return;

      // If the job already has manually-placed coords (from placeJob),
      // skip validation/EXIF/title phases and go straight to upload.
      if (job.coords) {
        await this.runUploadPhase(jobId, job.coords, job.parsedExif);
        return;
      }

      // ── Phase: validating ──────────────────────────────────────────────
      this.setPhase(jobId, 'validating');
      const validation = this.uploadService.validateFile(job.file);
      if (!validation.valid) {
        this.failJob(jobId, 'validating', validation.error!);
        return;
      }

      // ── Phase: parsing_exif ────────────────────────────────────────────
      this.setPhase(jobId, 'parsing_exif');
      const parsedExif = job.parsedExif ?? (await this.uploadService.parseExif(job.file));
      this.updateJob(jobId, { parsedExif });

      if (parsedExif.coords) {
        this.updateJob(jobId, { coords: parsedExif.coords, direction: parsedExif.direction });
      }

      // ── Phase: hashing ─────────────────────────────────────────────────
      this.setPhase(jobId, 'hashing');
      const fileHead = await readFileHead(job.file);
      const contentHash = await computeContentHash({
        fileHeadBytes: fileHead,
        fileSize: job.file.size,
        gpsCoords: parsedExif.coords
          ? { lat: parsedExif.coords.lat, lng: parsedExif.coords.lng }
          : undefined,
        capturedAt: parsedExif.capturedAt?.toISOString(),
        direction: parsedExif.direction,
      });
      this.updateJob(jobId, { contentHash });

      // ── Phase: dedup_check ─────────────────────────────────────────────
      this.setPhase(jobId, 'dedup_check');
      const dedupResult = await this.checkDedupHash(contentHash);
      if (dedupResult) {
        this.setPhase(jobId, 'skipped');
        this.updateJob(jobId, { existingImageId: dedupResult });
        this.runningIds.delete(jobId);
        this._uploadSkipped$.next({
          jobId,
          batchId: job.batchId,
          fileName: job.file.name,
          contentHash,
          existingImageId: dedupResult,
        });
        this.emitBatchProgress(job.batchId);
        this.checkBatchComplete(job.batchId);
        this.drainQueue();
        return;
      }

      // ── Routing by data availability ───────────────────────────────────
      const updatedJob = this.findJob(jobId)!;

      if (updatedJob.coords) {
        // Path A: GPS found → upload → save → reverse-geocode (enrichment)
        await this.runUploadPhase(jobId, updatedJob.coords, parsedExif);
        return;
      }

      // ── Phase: extracting_title ────────────────────────────────────────
      this.setPhase(jobId, 'extracting_title');
      const titleAddress = this.extractAddressFromFilename(job.file.name);

      if (titleAddress) {
        // Path B: address in title → upload → save → forward-geocode (enrichment)
        this.updateJob(jobId, { titleAddress });
        await this.runUploadPhase(jobId, undefined, parsedExif);
        return;
      }

      // Path C: no GPS + no address → missing_data
      this.setPhase(jobId, 'missing_data');
      this.runningIds.delete(jobId);
      this._missingData$.next({
        jobId,
        batchId: job.batchId,
        fileName: job.file.name,
        reason: 'no_gps_no_address',
      });
      this.emitBatchProgress(job.batchId);
      this.checkBatchComplete(job.batchId);
      this.drainQueue();
    } catch (err) {
      const current = this.findJob(jobId);
      this.failJob(
        jobId,
        current?.phase ?? 'queued',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Upload phase: delegates to UploadService, then runs post-upload enrichment.
   * Handles both Path A (has coords) and Path B (has titleAddress, no coords).
   */
  private async runUploadPhase(
    jobId: string,
    coords: ExifCoords | undefined,
    parsedExif: ParsedExif | undefined,
  ): Promise<void> {
    const job = this.findJob(jobId);
    if (!job) return;

    // ── Phase: uploading ───────────────────────────────────────────────
    this.setPhase(jobId, 'uploading');
    this.updateJob(jobId, { progress: 0 });

    // ── Phase: saving_record (UploadService does upload + insert as one call)
    const result = await this.uploadService.uploadFile(job.file, coords, parsedExif);

    if (result.error !== null) {
      const msg =
        result.error instanceof Error
          ? result.error.message
          : typeof result.error === 'object'
            ? ((result.error as { message?: string }).message ?? String(result.error))
            : String(result.error);

      // If we have a storage path from partial upload, try cleanup
      this.failJob(jobId, 'saving_record', msg);
      return;
    }

    this.setPhase(jobId, 'saving_record');
    this.updateJob(jobId, {
      progress: 100,
      imageId: result.id,
      storagePath: result.storagePath,
      coords: result.coords,
      direction: result.direction,
    });

    // ── Insert dedup hash ──────────────────────────────────────────────
    const savedJob = this.findJob(jobId)!;
    if (savedJob.contentHash && savedJob.imageId) {
      // Fire-and-forget — dedup hash insert failure is non-critical.
      this.supabase.client
        .from('dedup_hashes')
        .insert({
          image_id: savedJob.imageId,
          content_hash: savedJob.contentHash,
          user_id: this.auth.user()?.id,
        })
        .then();
    }

    // ── Post-upload enrichment ─────────────────────────────────────────
    const updatedJob = this.findJob(jobId)!;

    if (updatedJob.coords && !updatedJob.titleAddress) {
      // Path A: has GPS → reverse-geocode to get address (non-blocking enrichment)
      await this.enrichWithReverseGeocode(jobId);
    } else if (updatedJob.titleAddress && !updatedJob.coords) {
      // Path B: has title address → forward-geocode to get coords (non-blocking enrichment)
      await this.enrichWithForwardGeocode(jobId);
    }

    // ── Complete ───────────────────────────────────────────────────────
    this.setPhase(jobId, 'complete');
    this.runningIds.delete(jobId);

    const finalJob = this.findJob(jobId)!;
    this._imageUploaded$.next({
      jobId,
      batchId: finalJob.batchId,
      imageId: finalJob.imageId!,
      coords: finalJob.coords,
      direction: finalJob.direction,
      thumbnailUrl: finalJob.thumbnailUrl,
    });

    this.emitBatchProgress(finalJob.batchId);
    this.checkBatchComplete(finalJob.batchId);
    this.drainQueue();
  }

  /**
   * Path A enrichment: reverse-geocode GPS coordinates to populate address fields.
   * Non-blocking — failure is silent. UploadService already fires its own
   * reverse-geocode as fire-and-forget, so this phase just tracks the state.
   */
  private async enrichWithReverseGeocode(jobId: string): Promise<void> {
    this.setPhase(jobId, 'resolving_address');
    // UploadService.uploadFile already calls resolveAddress() internally,
    // so we don't need to call it again. This phase is for state tracking only.
  }

  /**
   * Path B enrichment: forward-geocode title address to get coordinates.
   * Non-blocking — failure is silent, coords stay null.
   */
  private async enrichWithForwardGeocode(jobId: string): Promise<void> {
    this.setPhase(jobId, 'resolving_coordinates');
    const job = this.findJob(jobId);
    if (!job?.titleAddress || !job.imageId) return;

    try {
      const result = await this.geocoding.forward(job.titleAddress);
      if (!result) return;

      // Update the DB row with the resolved coordinates.
      const { error } = await this.supabase.client
        .from('images')
        .update({
          latitude: result.lat,
          longitude: result.lng,
        })
        .eq('id', job.imageId);

      if (error) return;

      // Update the DB row with address fields from forward geocoding.
      await this.supabase.client.rpc('bulk_update_image_addresses', {
        p_image_ids: [job.imageId],
        p_address_label: result.addressLabel,
        p_city: result.city,
        p_district: result.district,
        p_street: result.street,
        p_country: result.country,
      });

      this.updateJob(jobId, { coords: { lat: result.lat, lng: result.lng } });
    } catch {
      // Enrichment failure is silent — coords remain null.
    }
  }

  // ── Title extraction ───────────────────────────────────────────────────────

  /**
   * Attempts to extract an address hint from a filename.
   * This is a simplified version of the planned FilenameLocationParser
   * (see folder-import.md §4.1). Returns undefined for camera-generated
   * filenames and timestamps.
   */
  private extractAddressFromFilename(filename: string): string | undefined {
    // Strip extension
    const base = filename.replace(/\.[^.]+$/, '');

    // Reject obvious camera-generated filenames
    if (CAMERA_PREFIXES.test(base)) return undefined;

    // Reject pure timestamps
    if (TIMESTAMP_PATTERN.test(base)) return undefined;

    // Normalise separators to spaces
    const normalised = base.replace(/[_-]+/g, ' ').trim();

    // Look for a street suffix pattern
    if (!STREET_SUFFIXES.test(normalised)) return undefined;

    // Clean up: collapse multiple spaces, trim
    const cleaned = normalised.replace(/\s+/g, ' ').trim();
    return cleaned || undefined;
  }

  // ── Job state helpers ──────────────────────────────────────────────────────

  private findJob(jobId: string): UploadJob | undefined {
    return this._jobs().find((j) => j.id === jobId);
  }

  private updateJob(jobId: string, patch: Partial<UploadJob>): void {
    this._jobs.update((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }

  private setPhase(jobId: string, phase: UploadPhase): void {
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

  private failJob(jobId: string, failedAt: UploadPhase, error: string): void {
    const job = this.findJob(jobId);
    this.runningIds.delete(jobId);
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
    if (job) {
      this.emitBatchProgress(job.batchId);
      this.checkBatchComplete(job.batchId);
    }
    this.drainQueue();
  }

  private cancelAllActive(): void {
    const active = this._jobs().filter((j) => !TERMINAL_PHASES.has(j.phase));
    for (const job of active) {
      this.runningIds.delete(job.id);
      if (job.storagePath) {
        this.supabase.client.storage.from('images').remove([job.storagePath]);
      }
      this.updateJob(job.id, {
        phase: 'error',
        statusLabel: 'Cancelled',
        error: 'Upload cancelled — user signed out.',
        failedAt: job.phase,
      });
    }
  }

  // ── Dedup helpers ──────────────────────────────────────────────────────────

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
      // Dedup check failure is non-critical — continue with upload.
      return null;
    }
  }

  // ── Folder scanning ────────────────────────────────────────────────────────

  private static readonly SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/tiff',
  ]);

  private static readonly SUPPORTED_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif',
  ]);

  /**
   * Recursively scan a directory handle for image files.
   * Updates batch progress as files are discovered.
   */
  private async scanDirectory(
    dirHandle: FileSystemDirectoryHandle,
    files: File[],
    batchId: string,
  ): Promise<void> {
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (
          UploadManagerService.SUPPORTED_IMAGE_TYPES.has(file.type) ||
          UploadManagerService.SUPPORTED_EXTENSIONS.has(ext)
        ) {
          files.push(file);
          this.updateBatch(batchId, { totalFiles: files.length });
          this._batchProgress$.next({
            batchId,
            label: this._batches().find((b) => b.id === batchId)?.label ?? '',
            overallProgress: 0,
            uploadedPercent: 0,
            skippedPercent: 0,
            totalFiles: files.length,
            completedFiles: 0,
            skippedFiles: 0,
            failedFiles: 0,
            activeFiles: 0,
          });
        }
      } else if (entry.kind === 'directory') {
        await this.scanDirectory(entry as FileSystemDirectoryHandle, files, batchId);
      }
    }
  }

  // ── Batch helpers ──────────────────────────────────────────────────────────

  private updateBatch(batchId: string, patch: Partial<UploadBatch>): void {
    this._batches.update((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, ...patch } : b)),
    );
  }

  /** Recompute and emit batch progress based on current job states. */
  private emitBatchProgress(batchId: string): void {
    const batch = this._batches().find((b) => b.id === batchId);
    if (!batch) return;

    const batchJobs = this._jobs().filter((j) => j.batchId === batchId);
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
  private checkBatchComplete(batchId: string): void {
    const batch = this._batches().find((b) => b.id === batchId);
    if (!batch || batch.status === 'complete' || batch.status === 'cancelled') return;

    const batchJobs = this._jobs().filter((j) => j.batchId === batchId);
    const total = batch.totalFiles || batchJobs.length;
    if (total === 0) return;

    const allTerminal = batchJobs.length >= total &&
      batchJobs.every((j) => TERMINAL_PHASES.has(j.phase));
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
