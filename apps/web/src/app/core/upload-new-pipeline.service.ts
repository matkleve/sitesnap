/**
 * UploadNewPipelineService — handles the 'new' upload pipeline.
 *
 * Pipeline paths:
 *  - Path A: GPS found → conflict check → upload → save → reverse-geocode
 *  - Path B: address in filename → conflict check → upload → save → forward-geocode
 *  - Path C: no GPS + no address → missing_data
 */

import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { computeContentHash, readFileHead } from './content-hash.util';
import { FilenameParserService } from './filename-parser.service';
import { PhotoLoadService } from './photo-load.service';
import { SupabaseService } from './supabase.service';
import { UploadAttachPipelineService } from './upload-attach-pipeline.service';
import { UploadConflictService } from './upload-conflict.service';
import { UploadEnrichmentService } from './upload-enrichment.service';
import { UploadJobStateService } from './upload-job-state.service';
import type { PipelineContext } from './upload-manager.types';
import { UploadQueueService } from './upload-queue.service';
import { ExifCoords, ParsedExif, UploadService } from './upload.service';

@Injectable({ providedIn: 'root' })
export class UploadNewPipelineService {
  private readonly uploadService = inject(UploadService);
  private readonly jobState = inject(UploadJobStateService);
  private readonly queue = inject(UploadQueueService);
  private readonly filenameParser = inject(FilenameParserService);
  private readonly conflictService = inject(UploadConflictService);
  private readonly enrichment = inject(UploadEnrichmentService);
  private readonly photoLoad = inject(PhotoLoadService);
  private readonly attachPipeline = inject(UploadAttachPipelineService);

  /** Run the new-upload pipeline for a single job. */
  async run(jobId: string, ctx: PipelineContext): Promise<void> {
    const job = this.jobState.findJob(jobId)!;

    // If the job already has manually-placed coords (from placeJob),
    // skip validation/EXIF/title phases and go straight to upload.
    if (job.coords && !job.conflictResolution) {
      await this.runUploadPhase(jobId, job.coords, job.parsedExif, ctx);
      return;
    }

    // If returning from conflict resolution, resume the appropriate flow.
    if (job.conflictResolution) {
      const updatedJob = this.jobState.findJob(jobId)!;
      if (updatedJob.mode === 'attach') {
        await this.attachPipeline.run(jobId, ctx);
        return;
      }
      await this.runUploadPhase(jobId, updatedJob.coords, updatedJob.parsedExif, ctx);
      return;
    }

    // ── Phase: validating ──────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'validating');
    const validation = this.uploadService.validateFile(job.file);
    if (!validation.valid) {
      ctx.failJob(jobId, 'validating', validation.error!);
      return;
    }

    // ── Phase: parsing_exif ────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'parsing_exif');
    const parsedExif = job.parsedExif ?? (await this.uploadService.parseExif(job.file));
    this.jobState.updateJob(jobId, { parsedExif });

    if (parsedExif.coords) {
      this.jobState.updateJob(jobId, {
        coords: parsedExif.coords,
        direction: parsedExif.direction,
      });
    }

    // ── Phase: hashing ─────────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'hashing');
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
    this.jobState.updateJob(jobId, { contentHash });

    // ── Phase: dedup_check ─────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'dedup_check');
    const dedupResult = await ctx.checkDedupHash(contentHash);
    if (dedupResult) {
      this.jobState.setPhase(jobId, 'skipped');
      this.jobState.updateJob(jobId, { existingImageId: dedupResult });
      this.queue.markDone(jobId);
      ctx.emitUploadSkipped({
        jobId,
        batchId: job.batchId,
        fileName: job.file.name,
        contentHash,
        existingImageId: dedupResult,
      });
      ctx.emitBatchProgress(job.batchId);
      ctx.drainQueue();
      return;
    }

    // ── Routing by data availability ───────────────────────────────────
    const updatedJob = this.jobState.findJob(jobId)!;

    if (updatedJob.coords) {
      // Path A: GPS found → conflict check → upload → save → reverse-geocode
      const conflicted = await this.runConflictCheck(jobId, ctx);
      if (conflicted) return;
      await this.runUploadPhase(jobId, updatedJob.coords, parsedExif, ctx);
      return;
    }

    // ── Phase: extracting_title ────────────────────────────────────────
    this.jobState.setPhase(jobId, 'extracting_title');
    const titleAddress = this.filenameParser.extractAddress(job.file.name);

    if (titleAddress) {
      // Path B: address in title → conflict check → upload → save → forward-geocode
      this.jobState.updateJob(jobId, { titleAddress });
      const conflicted = await this.runConflictCheck(jobId, ctx);
      if (conflicted) return;
      await this.runUploadPhase(jobId, undefined, parsedExif, ctx);
      return;
    }

    // Path C: no GPS + no address → missing_data
    this.jobState.setPhase(jobId, 'missing_data');
    this.queue.markDone(jobId);
    ctx.emitMissingData({
      jobId,
      batchId: job.batchId,
      fileName: job.file.name,
      reason: 'no_gps_no_address',
    });
    ctx.emitBatchProgress(job.batchId);
    ctx.drainQueue();
  }

  // ── Upload + save + enrich ─────────────────────────────────────────────────

  /**
   * Upload phase: delegates to UploadService, then runs post-upload enrichment.
   * Handles both Path A (has coords) and Path B (has titleAddress, no coords).
   */
  private async runUploadPhase(
    jobId: string,
    coords: ExifCoords | undefined,
    parsedExif: ParsedExif | undefined,
    ctx: PipelineContext,
  ): Promise<void> {
    const job = this.jobState.findJob(jobId);
    if (!job) return;

    // ── Phase: uploading ───────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'uploading');
    this.jobState.updateJob(jobId, { progress: 0 });

    // ── Phase: saving_record (UploadService does upload + insert as one call)
    const result = await this.uploadService.uploadFile(job.file, coords, parsedExif);

    if (result.error !== null) {
      const msg =
        result.error instanceof Error
          ? result.error.message
          : typeof result.error === 'object'
            ? ((result.error as { message?: string }).message ?? String(result.error))
            : String(result.error);

      ctx.failJob(jobId, 'saving_record', msg);
      return;
    }

    this.jobState.setPhase(jobId, 'saving_record');
    this.jobState.updateJob(jobId, {
      progress: 100,
      imageId: result.id,
      storagePath: result.storagePath,
      coords: result.coords,
      direction: result.direction,
    });

    // ── Insert dedup hash ──────────────────────────────────────────────
    const savedJob = this.jobState.findJob(jobId)!;
    if (savedJob.contentHash && savedJob.imageId) {
      // Dedup insert is best-effort — fire and forget via the manager's checkDedupHash approach
      // but we need supabase here. We'll handle it through the upload service pattern.
      // Actually, this was doing supabase.client.from('dedup_hashes').insert directly.
      // We keep the same pattern by injecting supabase.
      await this.insertDedupHash(savedJob.imageId, savedJob.contentHash);
    }

    // ── Post-upload enrichment ─────────────────────────────────────────
    const updatedJob = this.jobState.findJob(jobId)!;

    if (updatedJob.coords && !updatedJob.titleAddress) {
      // Path A: has GPS → reverse-geocode to get address
      this.jobState.setPhase(jobId, 'resolving_address');
      await this.enrichment.enrichWithReverseGeocode(updatedJob.imageId!);
    } else if (updatedJob.titleAddress && !updatedJob.coords) {
      // Path B: has title address → forward-geocode to get coords
      this.jobState.setPhase(jobId, 'resolving_coordinates');
      const enrichResult = await this.enrichment.enrichWithForwardGeocode(
        updatedJob.imageId!,
        updatedJob.titleAddress,
      );
      if (enrichResult) {
        this.jobState.updateJob(jobId, { coords: enrichResult.coords });
      }
    }

    // ── Complete ───────────────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'complete');
    this.queue.markDone(jobId);

    const finalJob = this.jobState.findJob(jobId)!;

    if (finalJob.thumbnailUrl && finalJob.imageId) {
      this.photoLoad.setLocalUrl(finalJob.imageId, finalJob.thumbnailUrl);
    }

    ctx.emitImageUploaded({
      jobId,
      batchId: finalJob.batchId,
      imageId: finalJob.imageId!,
      coords: finalJob.coords,
      direction: finalJob.direction,
      thumbnailUrl: finalJob.thumbnailUrl,
    });

    ctx.emitBatchProgress(finalJob.batchId);
    ctx.drainQueue();
  }

  // ── Conflict check ─────────────────────────────────────────────────────────

  /**
   * Check for existing photoless rows that match the upload's location.
   * If a conflict is found, pauses the job at `awaiting_conflict_resolution`
   * and releases the concurrency slot. Returns true if the job was paused.
   */
  private async runConflictCheck(jobId: string, ctx: PipelineContext): Promise<boolean> {
    const job = this.jobState.findJob(jobId);
    if (!job) return false;

    this.jobState.setPhase(jobId, 'conflict_check');

    const candidate = await this.conflictService.findConflict(job.coords, job.titleAddress);
    if (!candidate) return false;

    this.jobState.updateJob(jobId, { conflictCandidate: candidate });
    this.jobState.setPhase(jobId, 'awaiting_conflict_resolution');

    // Release concurrency slot — this job is paused
    this.queue.markDone(jobId);

    ctx.emitLocationConflict({
      jobId,
      batchId: job.batchId,
      fileName: job.file.name,
      candidate,
      uploadCoords: job.coords,
      uploadAddress: job.titleAddress,
    });

    ctx.drainQueue();
    return true;
  }

  // ── Dedup hash helper ──────────────────────────────────────────────────────

  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private async insertDedupHash(imageId: string, contentHash: string): Promise<void> {
    this.supabase.client
      .from('dedup_hashes')
      .insert({
        image_id: imageId,
        content_hash: contentHash,
        user_id: this.auth.user()?.id,
      })
      .then();
  }
}
