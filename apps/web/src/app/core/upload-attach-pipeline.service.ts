/**
 * UploadAttachPipelineService — handles the 'attach' upload pipeline.
 *
 * Pipeline: validating → parsing_exif → hashing → dedup_check → uploading →
 *           replacing_record → enrichment → complete.
 * Adds a photo to an existing photoless image row, with smart coordinate handling.
 */

import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { computeContentHash, readFileHead } from './content-hash.util';
import { PhotoLoadService } from './photo-load.service';
import { SupabaseService } from './supabase.service';
import { UploadEnrichmentService } from './upload-enrichment.service';
import { UploadJobStateService } from './upload-job-state.service';
import type { PipelineContext } from './upload-manager.types';
import { UploadQueueService } from './upload-queue.service';
import { UploadStorageService } from './upload-storage.service';
import { UploadService } from './upload.service';

@Injectable({ providedIn: 'root' })
export class UploadAttachPipelineService {
  private readonly uploadService = inject(UploadService);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly photoLoad = inject(PhotoLoadService);
  private readonly jobState = inject(UploadJobStateService);
  private readonly queue = inject(UploadQueueService);
  private readonly storage = inject(UploadStorageService);
  private readonly enrichment = inject(UploadEnrichmentService);

  /** Run the attach pipeline for a single job. */
  async run(jobId: string, ctx: PipelineContext): Promise<void> {
    const job = this.jobState.findJob(jobId)!;
    console.log('[attach-pipeline] ▶ START:', {
      jobId: jobId.slice(0, 8),
      targetImageId: job.targetImageId,
      fileName: job.file.name,
    });

    // ── Phase: validating ──────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'validating');
    console.log('[attach-pipeline] phase: validating');
    const validation = this.uploadService.validateFile(job.file);
    if (!validation.valid) {
      console.error('[attach-pipeline] ✗ validation failed:', validation.error);
      ctx.failJob(jobId, 'validating', validation.error!);
      return;
    }
    console.log('[attach-pipeline] ✓ validation passed');

    // ── Phase: parsing_exif ────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'parsing_exif');
    console.log('[attach-pipeline] phase: parsing_exif');
    const parsedExif = job.parsedExif ?? (await this.uploadService.parseExif(job.file));
    console.log('[attach-pipeline] ✓ EXIF parsed:', {
      coords: parsedExif.coords,
      capturedAt: parsedExif.capturedAt,
      direction: parsedExif.direction,
    });
    this.jobState.updateJob(jobId, { parsedExif });

    if (parsedExif.coords) {
      this.jobState.updateJob(jobId, {
        coords: parsedExif.coords,
        direction: parsedExif.direction,
      });
    }

    // ── Phase: hashing ─────────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'hashing');
    console.log('[attach-pipeline] phase: hashing');
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
    console.log('[attach-pipeline] ✓ hash computed:', contentHash);

    // ── Phase: dedup_check ─────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'dedup_check');
    console.log('[attach-pipeline] phase: dedup_check');
    const dedupResult = await ctx.checkDedupHash(contentHash);
    console.log('[attach-pipeline] dedup result:', dedupResult);
    if (dedupResult) {
      console.warn(
        '[attach-pipeline] ✗ dedup match found, skipping. existingImageId:',
        dedupResult,
      );
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
    console.log('[attach-pipeline] phase: uploading');
    this.jobState.updateJob(jobId, { progress: 0 });

    const storagePath = await this.storage.upload(job.file);
    if (!storagePath) {
      console.error('[attach-pipeline] ✗ storage upload returned null');
      ctx.failJob(jobId, 'uploading', 'Storage upload failed.');
      return;
    }
    console.log('[attach-pipeline] ✓ uploaded to storage:', storagePath);
    this.jobState.updateJob(jobId, { storagePath, progress: 100 });

    // ── Phase: replacing_record ────────────────────────────────────────
    this.jobState.setPhase(jobId, 'replacing_record');
    console.log('[attach-pipeline] phase: replacing_record, targetImageId:', job.targetImageId);

    // Fetch existing row to check if it already has coordinates
    const { data: existingRow, error: fetchError } = await this.supabase.client
      .from('images')
      .select('latitude, longitude')
      .eq('id', job.targetImageId!)
      .single();

    console.log('[attach-pipeline] fetched existing row:', { existingRow, fetchError });

    if (fetchError) {
      console.error('[attach-pipeline] ✗ failed to fetch existing row:', fetchError);
      await this.supabase.client.storage.from('images').remove([storagePath]);
      ctx.failJob(jobId, 'replacing_record', 'Could not read existing image row.');
      return;
    }

    const hadExistingCoords = existingRow.latitude != null && existingRow.longitude != null;

    // Determine what to update based on conflict resolution or default behavior
    const isAttachKeep = job.conflictResolution === 'attach_keep';

    const updateData: Record<string, unknown> = {
      storage_path: storagePath,
      thumbnail_path: null,
    };

    // Always write EXIF-specific fields
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

    // Write lat/lng only if the row doesn't already have coords
    // (or if conflict resolution chose attach_replace)
    if (!hadExistingCoords && parsedExif.coords && !isAttachKeep) {
      updateData['latitude'] = parsedExif.coords.lat;
      updateData['longitude'] = parsedExif.coords.lng;
    } else if (job.conflictResolution === 'attach_replace' && parsedExif.coords) {
      updateData['latitude'] = parsedExif.coords.lat;
      updateData['longitude'] = parsedExif.coords.lng;
    }

    console.log('[attach-pipeline] DB update payload:', {
      targetImageId: job.targetImageId,
      updateData,
      contentHash: job.contentHash,
      hadExistingCoords,
      isAttachKeep,
    });

    const { error: updateError } = await this.supabase.client
      .from('images')
      .update(updateData)
      .eq('id', job.targetImageId!);

    if (updateError) {
      console.error('[attach-pipeline] ✗ DB update failed:', updateError);
      await this.supabase.client.storage.from('images').remove([storagePath]);
      ctx.failJob(jobId, 'replacing_record', updateError.message);
      return;
    }
    console.log('[attach-pipeline] ✓ DB row updated successfully');

    // Verification: read back to confirm the write actually landed (RLS can silently block updates)
    const { data: verifyRow, error: verifyError } = await this.supabase.client
      .from('images')
      .select('storage_path, thumbnail_path')
      .eq('id', job.targetImageId!)
      .single();
    console.log('[attach-pipeline] verification read-back:', { verifyRow, verifyError });
    if (verifyRow && verifyRow.storage_path !== storagePath) {
      console.error(
        '[attach-pipeline] ✗ WRITE DID NOT PERSIST — RLS likely blocked the update. Expected:',
        storagePath,
        'Got:',
        verifyRow.storage_path,
      );
    }

    // Insert dedup hash
    const updatedJob = this.jobState.findJob(jobId)!;
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

    const finalCoords =
      parsedExif.coords ??
      (hadExistingCoords ? { lat: existingRow.latitude!, lng: existingRow.longitude! } : undefined);

    this.jobState.updateJob(jobId, {
      imageId: updatedJob.targetImageId,
      coords: finalCoords,
      direction: parsedExif.direction,
    });

    // ── Post-attach enrichment ─────────────────────────────────────────
    if (!isAttachKeep) {
      if (finalCoords && !updatedJob.titleAddress) {
        this.jobState.setPhase(jobId, 'resolving_address');
        await this.enrichment.enrichWithReverseGeocode(updatedJob.targetImageId!);
      } else if (updatedJob.titleAddress && !finalCoords) {
        this.jobState.setPhase(jobId, 'resolving_coordinates');
        const result = await this.enrichment.enrichWithForwardGeocode(
          updatedJob.targetImageId!,
          updatedJob.titleAddress,
        );
        if (result) {
          this.jobState.updateJob(jobId, { coords: result.coords });
        }
      }
    }

    // ── Complete ───────────────────────────────────────────────────────
    this.jobState.setPhase(jobId, 'complete');
    this.queue.markDone(jobId);

    const finalJob = this.jobState.findJob(jobId)!;

    console.log('[attach-pipeline] phase: complete', {
      thumbnailUrl: finalJob.thumbnailUrl,
      targetImageId: finalJob.targetImageId,
      coords: finalJob.coords,
      direction: finalJob.direction,
    });

    if (finalJob.thumbnailUrl) {
      console.log('[attach-pipeline] setting local URL for photoLoad');
      this.photoLoad.setLocalUrl(finalJob.targetImageId!, finalJob.thumbnailUrl);
    } else {
      console.warn('[attach-pipeline] no thumbnailUrl to set in photoLoad');
    }

    const attachedEvent = {
      jobId,
      imageId: finalJob.targetImageId!,
      newStoragePath: storagePath,
      localObjectUrl: finalJob.thumbnailUrl,
      coords: finalJob.coords,
      direction: finalJob.direction,
      hadExistingCoords,
    };
    console.log('[attach-pipeline] emitting imageAttached$:', attachedEvent);
    ctx.emitImageAttached(attachedEvent);

    ctx.emitBatchProgress(finalJob.batchId);
    console.log('[attach-pipeline] ▶ DONE');
    ctx.drainQueue();
  }
}
