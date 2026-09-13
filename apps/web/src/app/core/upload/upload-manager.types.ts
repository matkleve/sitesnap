/**
 * Shared types, interfaces, and event shapes for the upload pipeline.
 *
 * Extracted from UploadManagerService to break circular imports
 * (sub-services like UploadJobStateService and UploadBatchService
 * need these types but should not import the manager itself).
 */

import type { AreaConflict } from './address-resolution/upload-area-evidence.types';
import type { ExifCoords, ParsedExif } from './upload.service';

// ── Phase & Mode ───────────────────────────────────────────────────────────────

export type UploadPhase =
  | 'queued'
  | 'validating'
  | 'parsing_exif'
  | 'converting_format'
  | 'hashing'
  | 'dedup_check'
  | 'skipped'
  | 'extracting_title'
  | 'resolving_location'
  | 'awaiting_disambiguation'
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

/** Pre-upload geocode resolution outcome for a job. @see upload-location-resolution.md */
export type UploadResolutionStatus = 'pending' | 'resolved' | 'failed' | 'not_required';

/** UI collapse stage for grouped address candidates. @see upload-resolver-tray.md */
export type UploadDisambiguationCollapseStage = 'city' | 'partial' | 'per_file';

export type UploadDiscriminatingField =
  | 'city'
  | 'municipality'
  | 'district'
  | 'state'
  | 'postcode';

export interface UploadAddressCandidate {
  id: string;
  addressLabel: string;
  lat: number;
  lng: number;
  displayName?: string;
  /** When set, UI resolves option copy via t(labelKey, addressLabel) with labelParams. */
  labelKey?: string;
  labelParams?: Record<string, string>;
  city?: string | null;
  municipality?: string | null;
  district?: string | null;
  state?: string | null;
  postcode?: string | null;
  /** Relative score within a search result set (0–1). */
  score?: number;
}

/** One address + folder-prefix group awaiting or completing user choice (OD-1, OD-3). */
export interface UploadDisambiguationGroup {
  id: string;
  batchId: string;
  /** Stable key: normalized titleAddress + folder prefix. */
  queryKey: string;
  folderDisplayPath: string;
  titleAddress: string;
  jobIds: string[];
  candidates: UploadAddressCandidate[];
  collapseStage: UploadDisambiguationCollapseStage;
  resolutionStatus: UploadResolutionStatus;
  /** When true, jobs in this group must not enter upload until resolved. */
  resolutionGateOpen: boolean;
  selectedCandidateId?: string;
  localityHint?: string;
  /** geocode = Step 3 multi-hit; source = text vs EXIF; city_step/house_step = 1A/1B */
  disambiguationKind?: UploadDisambiguationKind;
  /** Tray stepper position within a group. */
  trayStep?: UploadTrayStep;
  /** Step 1A confirmed city (unlock 1B). */
  confirmedCity?: string | null;
  /** Gate for Step 1B until city confirmed. */
  step1bGate?: 'disabled' | 'active';
  /** Branch B bias centroid from project_locations. */
  projectCentroid?: { lat: number; lng: number; city?: string | null };
  /** Suggested cities for Step 1A autocomplete. */
  citySuggestions?: string[];
  /** House number candidates for Step 1B. */
  houseNumberCandidates?: UploadAddressCandidate[];
  /** Branch C 5a: which field differs between Photon candidates. */
  discriminatingField?: UploadDiscriminatingField;
  /** Admin level-map conflicts for admin_level_conflict tray. */
  areaConflicts?: AreaConflict[];
}

export type UploadJobMode = 'new' | 'replace' | 'attach';
export type UploadLocationRequirementMode = 'required' | 'optional';

export type UploadJobIssueKind =
  | 'duplicate_file'
  | 'missing_gps'
  | 'address_deferred'
  | 'address_ambiguous'
  | 'document_unresolved'
  | 'conflict_review'
  | 'upload_error';

export type UploadDisambiguationKind =
  | 'geocode'
  | 'source'
  | 'layer_package'
  | 'admin_level_conflict'
  | 'city_step'
  | 'house_step'
  | 'containment_check';

export type UploadTrayStep = '1a' | '1b' | '3';

// ── Job ────────────────────────────────────────────────────────────────────────

export interface UploadJob {
  id: string;
  batchId: string;
  file: File;
  /** Immutable user-selected file for dedup fingerprinting (HEIC stays HEIC until upload gate). */
  sourceFile?: File;
  /** Phase 0 complete — EXIF parsed; HEIC conversion is deferred until upload gate. */
  filePrepareComplete?: boolean;
  phase: UploadPhase;
  progress: number;
  statusLabel: string;
  error?: string;
  failedAt?: UploadPhase;
  coords?: ExifCoords;
  titleAddress?: string;
  /** Effective source selected by routing for location resolution decisions. */
  locationSourceUsed?: 'exif' | 'file' | 'folder' | 'none';
  /** Source of titleAddress used for routing and audit visibility. */
  titleAddressSource?: 'file' | 'folder';
  /** Optional geocoded coordinates derived from titleAddress for reconciliation. */
  titleAddressCoords?: ExifCoords;
  /** Distance between EXIF coords and title-derived coords when both are available. */
  locationMismatchMeters?: number;
  /**
   * Low-confidence or residual address fragments from filename/folder title parsing.
   * Persisted to media_items.address_notes for display in detail view.
   * @see docs/specs/service/media-upload-service/upload-manager-pipeline.md § Action 11c
   */
  addressNotes?: string[];
  direction?: number;
  /** Persisted `media_items` row id after save (canonical: mediaId). */
  mediaId?: string;
  storagePath?: string;
  /** Original relative path from file/folder selection context, persisted immutably on insert. */
  relativePath?: string;
  thumbnailUrl?: string;
  submittedAt: Date;
  /** Cached EXIF parse to avoid re-parsing on retry. */
  parsedExif?: ParsedExif;
  /** Dedup content hash (set after 'hashing' phase). */
  contentHash?: string;
  /** Hash algorithm used for `contentHash` (`photo_v1` | `binary_v1`). */
  contentHashAlgo?: 'photo_v1' | 'binary_v1';
  /** If phase === 'skipped', the existing media row id that matched. */
  existingMediaId?: string;
  /** Step 3: duplicate tag before geocode — upload may still proceed. */
  duplicateOfMediaId?: string;
  /** Optional UI issue classification derived by pipeline decisions. */
  issueKind?: UploadJobIssueKind;
  /** Candidate addresses used when title-derived location cannot be auto-disambiguated. */
  addressCandidates?: UploadAddressCandidate[];
  /** Allows one explicit user-approved bypass of duplicate skip handling. */
  forceDuplicateUpload?: boolean;
  /**
   * Set alongside `phase: 'error'` when the job was deliberately cancelled
   * (by the user or by sign-out), as opposed to genuinely failing. Existing
   * consumers must not derive this from `error`'s message text — the string
   * is user-facing copy and goes through i18n.
   * @see docs/audits/upload-process-analysis-2026-09-08/10-findings.md UP-08
   */
  wasCancelled?: boolean;

  // ── Replace / Attach mode fields ──

  /** Pipeline mode. Determines the pipeline path the job follows. */
  mode: UploadJobMode;
  /** For 'replace' and 'attach' modes: the existing media row id to update. */
  targetMediaId?: string;
  /** For 'replace' mode: the old storage_path to delete after DB update succeeds. */
  oldStoragePath?: string;
  /** For 'replace' mode: the old thumbnail_path to delete after DB update succeeds. */
  oldThumbnailPath?: string;
  /** Optional primary project context for mixed-media shadow writes. */
  projectId?: string;
  /** Optional explicit set of bound projects for rows that belong to multiple projects. */
  projectIds?: string[];
  /** If conflict detected, the existing photoless row that matched. */
  conflictCandidate?: ConflictCandidate;
  /** User's resolution when a conflict was detected. */
  conflictResolution?: ConflictResolution;
  /** Session-scoped location gate mode chosen in the upload panel. */
  locationRequirementMode?: UploadLocationRequirementMode;
  /** Pre-upload disambiguation group (OD-1). */
  disambiguationGroupId?: string;
  /** Pre-upload geocode resolution state. */
  resolutionStatus?: UploadResolutionStatus;
  /** Folder path prefix snapshot for tray labels (from relativePath). */
  folderDisplayPath?: string;
  /** Search Object dedup key for batch resolution and tray grouping. */
  groupingKey?: string;
  /** When true, save should set media_items.location_status = partial (L11). */
  pendingPartialLocation?: boolean;
}

// ── Options ────────────────────────────────────────────────────────────────────

export interface SubmitOptions {
  projectId?: string;
  batchLabel?: string;
  locationRequirementMode?: UploadLocationRequirementMode;
}

// ── Events ─────────────────────────────────────────────────────────────────────

export interface ImageUploadedEvent {
  jobId: string;
  batchId: string;
  mediaId: string;
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

export interface DisambiguationRequiredEvent {
  batchId: string;
  groupId: string;
  queryKey: string;
  jobIds: string[];
  candidateCount: number;
}

export interface DisambiguationResolvedEvent {
  batchId: string;
  groupId: string;
  jobIds: string[];
  selectedCandidateId: string;
}

export interface UploadSkippedEvent {
  jobId: string;
  batchId: string;
  fileName: string;
  contentHash: string;
  existingMediaId: string;
}

export interface DuplicateDetectedEvent {
  jobId: string;
  batchId: string;
  fileName: string;
  contentHash: string;
  existingMediaId: string;
}

export interface DedupHashMatch {
  mediaItemId: string;
  registeredByUserId: string;
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
  mediaId: string;
  newStoragePath: string;
  localObjectUrl?: string;
  coords?: ExifCoords;
  direction?: number;
}

export interface ImageAttachedEvent {
  jobId: string;
  mediaId: string;
  newStoragePath: string;
  localObjectUrl?: string;
  coords?: ExifCoords;
  direction?: number;
  hadExistingCoords: boolean;
}

// ── Conflict ───────────────────────────────────────────────────────────────────

/** An existing images row (no photo) that conflicts with an incoming upload's location. */
export interface ConflictCandidate {
  mediaId: string;
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
  /** Count of groups with resolutionGateOpen (aggregates only; no batch-wide gate). */
  pendingDisambiguationCount?: number;
  /** Tray focus group id when multiple groups are open. */
  activeDisambiguationGroupId?: string | null;
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
  getAbortSignal(jobId: string): AbortSignal | undefined;
  /**
   * Aborts the in-flight request's AbortController for this job, if any.
   * Note: the installed @supabase/storage-js client does not honour the
   * signal for `.upload()` calls, so this cannot interrupt an in-flight
   * upload's HTTP request — it only narrows the window for the manual
   * `abortSignal?.aborted` checkpoints inside the upload pipeline.
   * @see docs/audits/upload-process-analysis-2026-09-08/10-findings.md UP-06
   */
  abortJobRequest(jobId: string): void;
  checkDedupHash(contentHash: string): Promise<DedupHashMatch | null>;
  getCurrentUserId(): string | undefined;
  emitUploadSkipped(event: UploadSkippedEvent): void;
  emitDuplicateDetected(event: DuplicateDetectedEvent): void;
  emitImageUploaded(event: ImageUploadedEvent): void;
  emitImageReplaced(event: ImageReplacedEvent): void;
  emitImageAttached(event: ImageAttachedEvent): void;
  emitMissingData(event: MissingDataEvent): void;
  emitLocationConflict(event: LocationConflictEvent): void;
}
