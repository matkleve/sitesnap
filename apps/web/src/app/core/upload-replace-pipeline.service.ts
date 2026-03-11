/**
 * UploadReplacePipelineService — handles the 'replace' upload pipeline.
 *
 * Pipeline: validating → hashing → dedup_check → uploading → replacing_record → complete.
 * Swaps the file on an existing image row, updates EXIF metadata, and cleans up old files.
 */

import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { computeContentHash, readFileHead } from './content-hash.util';
import { PhotoLoadService } from './photo-load.service';
import { SupabaseService } from './supabase.service';
import { UploadJobStateService } from './upload-job-state.service';
import type { PipelineContext } from './upload-manager.types';
import { UploadQueueService } from './upload-queue.service';
import { UploadStorageService } from './upload-storage.service';
import { UploadService } from './upload.service';

@Injectable({ providedIn: 'root' })
export class UploadReplacePipelineService {
  private readonly uploadService = inject(UploadService);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly photoLoad = inject(PhotoLoadService);
  private readonly jobState = inject(UploadJobStateService);
  private readonly queue = inject(UploadQueueService);
  private readonly storage = inject(UploadStorageService);

  /** Run the replace pipeline for a single job. */
  async run(jobId: string, ctx: PipelineContext): Promise<void> {
    const job = this.jobState.findJob(jobId)!;

    // ── Phase: validating ──────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'validating');
    const validation = this.uploadService.validateFile(job.file);
    if (!validation.valid) {
      ctx.failJob(jobId, 'validating', validation.error!);
      return;
    }

    // ── Fetch existing row to capture old paths ────────────────────────
    const { data: existingRow, error: fetchError } = await this.supabase.client
      .from('images')
      .select('storage_path, thumbnail_path')
      .eq('id', job.targetImageId!)
      .single();

    if (fetchError || !existingRow) {
      ctx.failJob(jobId, 'validating', 'Could not find the existing image row.');
      return;
    }

    this.jobState.updateJob(jobId, {
      oldStoragePath: existingRow.storage_path ?? undefined,
      oldThumbnailPath: existingRow.thumbnail_path ?? undefined,
    });

    // ── Phase: hashing (skip EXIF for replace — existing row has metadata) ──
    this.jobState.setPhase(jobId, 'hashing');
    const fileHead = await readFileHead(job.file);
    const contentHash = await computeContentHash({
      fileHeadBytes: fileHead,
      fileSize: job.file.size,
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

    // ── Phase: uploading ───────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'uploading');
    this.jobState.updateJob(jobId, { progress: 0 });

    const storagePath = await this.storage.upload(job.file);
    if (!storagePath) {
      ctx.failJob(jobId, 'uploading', 'Storage upload failed.');
      return;
    }
    this.jobState.updateJob(jobId, { storagePath, progress: 100 });

    // ── Phase: replacing_record ────────────────────────────────────────
    this.jobState.setPhase(jobId, 'replacing_record');

    // Parse EXIF from new file for metadata update
    const parsedExif = await this.uploadService.parseExif(job.file);

    const updateData: Record<string, unknown> = {
      storage_path: storagePath,
      thumbnail_path: null,
    };
    if (parsedExif.coords) {
      updateData['exif_latitude'] = parsedExif.coords.lat;
      updateData['exif_longitude'] = parsedExif.coords.lng;
    }
    if (parsedExif.capturedAt) {
      updateData['captured_at'] = parsedExif.capturedAt;
    }
    if (parsedExif.direction != null) {
      updateData['direction'] = parsedExif.direction;
    }

    const { error: updateError } = await this.supabase.client
      .from('images')
      .update(updateData)
      .eq('id', job.targetImageId!);

    if (updateError) {
      await this.supabase.client.storage.from('images').remove([storagePath]);
      ctx.failJob(jobId, 'replacing_record', updateError.message);
      return;
    }

    // Best-effort cleanup of old files
    const updatedJob = this.jobState.findJob(jobId)!;
    const pathsToDelete: string[] = [];
    if (updatedJob.oldStoragePath) pathsToDelete.push(updatedJob.oldStoragePath);
    if (updatedJob.oldThumbnailPath) pathsToDelete.push(updatedJob.oldThumbnailPath);
    if (pathsToDelete.length > 0) {
      this.supabase.client.storage.from('images').remove(pathsToDelete);
    }

    // Insert dedup hash
    if (updatedJob.contentHash) {
      this.supabase.client
        .from('dedup_hashes')
        .insert({
          image_id: updatedJob.targetImageId,
          content_hash: updatedJob.contentHash,
          user_id: this.auth.user()?.id,
        })
        .then();
    }

    this.jobState.updateJob(jobId, {
      imageId: updatedJob.targetImageId,
      coords: parsedExif.coords,
      direction: parsedExif.direction,
    });

    // ── Complete ───────────────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'complete');
    this.queue.markDone(jobId);

    const finalJob = this.jobState.findJob(jobId)!;

    if (finalJob.thumbnailUrl) {
      this.photoLoad.setLocalUrl(finalJob.targetImageId!, finalJob.thumbnailUrl);
    }

    ctx.emitImageReplaced({
      jobId,
      imageId: finalJob.targetImageId!,
      newStoragePath: storagePath,
      localObjectUrl: finalJob.thumbnailUrl,
      coords: parsedExif.coords,
      direction: parsedExif.direction,
    });

    ctx.emitBatchProgress(finalJob.batchId);
    ctx.drainQueue();
  }
}
