/**
 * Shared types, interfaces, and event shapes for the upload pipeline.
 *
 * Extracted from UploadManagerService to break circular imports
 * (sub-services like UploadJobStateService and UploadBatchService
 * need these types but should not import the manager itself).
 */

import type { ExifCoords, ParsedExif } from './upload.service';

// ── Phase & Mode ───────────────────────────────────────────────────────────────

export type UploadPhase =
  | 'queued'
  | 'validating'
  | 'parsing_exif'
  | 'hashing'
  | 'dedup_check'
  | 'skipped'
  | 'extracting_title'
  | 'conflict_check'
  | 'awaiting_conflict_resolution'
  | 'uploading'
  | 'saving_record'
  | 'replacing_record'
  | 'resolving_address'
  | 'resolving_coordinates'
  | 'missing_data'
  | 'complete'
  | 'error';

export type UploadJobMode = 'new' | 'replace' | 'attach';

// ── Job ────────────────────────────────────────────────────────────────────────

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

  // ── Replace / Attach mode fields ──

  /** Pipeline mode. Determines the pipeline path the job follows. */
  mode: UploadJobMode;
  /** For 'replace' and 'attach' modes: the existing image row ID to update. */
  targetImageId?: string;
  /** For 'replace' mode: the old storage_path to delete after DB update succeeds. */
  oldStoragePath?: string;
  /** For 'replace' mode: the old thumbnail_path to delete after DB update succeeds. */
  oldThumbnailPath?: string;
  /** If conflict detected, the existing photoless row that matched. */
  conflictCandidate?: ConflictCandidate;
  /** User's resolution when a conflict was detected. */
  conflictResolution?: ConflictResolution;
}

// ── Options ────────────────────────────────────────────────────────────────────

export interface SubmitOptions {
  projectId?: string;
  batchLabel?: string;
}

// ── Events ─────────────────────────────────────────────────────────────────────

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

export interface LocationConflictEvent {
  jobId: string;
  batchId: string;
  fileName: string;
  candidate: ConflictCandidate;
  uploadCoords?: ExifCoords;
  uploadAddress?: string;
}

export interface ImageReplacedEvent {
  jobId: string;
  imageId: string;
  newStoragePath: string;
  localObjectUrl?: string;
  coords?: ExifCoords;
  direction?: number;
}

export interface ImageAttachedEvent {
  jobId: string;
  imageId: string;
  newStoragePath: string;
  localObjectUrl?: string;
  coords?: ExifCoords;
  direction?: number;
  hadExistingCoords: boolean;
}

// ── Conflict ───────────────────────────────────────────────────────────────────

/** An existing images row (no photo) that conflicts with an incoming upload's location. */
export interface ConflictCandidate {
  imageId: string;
  addressLabel?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
}

/**
 * How the user wants to resolve a location conflict.
 * - `attach_replace`: attach photo to existing row, overwrite location with EXIF/upload data.
 * - `attach_keep`: attach photo to existing row, keep the row's current location data.
 * - `create_new`: ignore the match, create a brand-new images row (normal flow).
 */
export type ConflictResolution = 'attach_replace' | 'attach_keep' | 'create_new';

// ── Batch ──────────────────────────────────────────────────────────────────────

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

// ── Pipeline context ───────────────────────────────────────────────────────────

/**
 * Callback interface passed to pipeline services so they can interact
 * with the manager's queue, events, and helpers without a circular dependency.
 */
export interface PipelineContext {
  failJob(jobId: string, failedAt: UploadPhase, error: string): void;
  emitBatchProgress(batchId: string): void;
  drainQueue(): void;
  checkDedupHash(contentHash: string): Promise<string | null>;
  emitUploadSkipped(event: UploadSkippedEvent): void;
  emitImageUploaded(event: ImageUploadedEvent): void;
  emitImageReplaced(event: ImageReplacedEvent): void;
  emitImageAttached(event: ImageAttachedEvent): void;
  emitMissingData(event: MissingDataEvent): void;
  emitLocationConflict(event: LocationConflictEvent): void;
}
