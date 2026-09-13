import type { ParsedExif } from '../upload.service';
import type { PipelineContext, UploadJob } from '../upload-manager.types';
import type { UploadQueueService } from './upload-queue.service';
import type { UploadJobStateService } from './upload-job-state.service';
import type { UploadService } from '../upload.service';
import { computeUploadContentHash, resolveUploadSourceFile } from './content-hash.util';
import { isContentHashDedupEligible } from './upload-dedup-eligibility.util';
import { applyDedupMatch, shouldAutoSkipDedupMatch } from './upload-dedup-match.util';
import { handleDedupSkip } from './upload-dedup-skip.util';
import {
  lookupInflightDedupHash,
  tryRegisterInflightDedupHash,
} from './upload-inflight-dedup.registry';
import { isHeldForDisambiguation } from './upload-disambiguation-hold.util';

export type UploadDedupCheckOutcome = 'ineligible' | 'no_match' | 'skipped' | 'issue';

/**
 * The `PipelineContext` members the dedup path calls. Narrowing matches
 * `upload-dedup-skip.util.ts`, which already takes a `Pick<PipelineContext, …>`.
 */
export type UploadDedupCheckContext = Pick<
  PipelineContext,
  | 'checkDedupHash'
  | 'getCurrentUserId'
  | 'emitUploadSkipped'
  | 'emitDuplicateDetected'
  | 'emitBatchProgress'
  | 'drainQueue'
>;

/** Narrowed to the members this module calls — see `HeicPrepareUploadService` for why. */
type UploadDedupCheckDeps = {
  jobState: UploadJobStateService;
  queue: Pick<UploadQueueService, 'markDone'>;
  uploadService: Pick<UploadService, 'resolveMediaType'>;
};

function handleInflightDedupMatch(
  deps: UploadDedupCheckDeps,
  jobId: string,
  job: UploadJob,
  contentHash: string,
  currentUserId: string | undefined,
  ctx: UploadDedupCheckContext,
): UploadDedupCheckOutcome | null {
  const inflight = lookupInflightDedupHash(contentHash);
  if (!inflight || inflight.jobId === jobId) {
    return null;
  }

  if (shouldAutoSkipDedupMatch(
    { mediaItemId: '', registeredByUserId: inflight.registeredByUserId },
    currentUserId,
  )) {
    handleDedupSkip({
      jobId,
      job,
      contentHash,
      existingMediaId: job.existingMediaId ?? '',
      setPhase: (id, phase) => deps.jobState.setPhase(id, phase),
      updateJob: (id, patch) => deps.jobState.updateJob(id, patch),
      markDone: (id) => deps.queue.markDone(id),
      ctx,
    });
    return 'skipped';
  }

  deps.jobState.setPhase(jobId, 'missing_data');
  deps.jobState.updateJob(jobId, {
    issueKind: 'duplicate_file',
    duplicateOfMediaId: undefined,
  });
  deps.queue.markDone(jobId);
  ctx.emitDuplicateDetected({
    jobId,
    batchId: job.batchId,
    fileName: job.file.name,
    contentHash,
    existingMediaId: '',
  });
  ctx.emitBatchProgress(job.batchId);
  ctx.drainQueue();
  return 'issue';
}

/**
 * Hash (when needed), org dedup lookup, and same-user vs colleague routing.
 * @see docs/specs/service/media-upload-service/upload-manager-pipeline.dedup-scope.supplement.md
 */
export async function runUploadDedupCheck(
  deps: UploadDedupCheckDeps,
  jobId: string,
  job: UploadJob,
  parsedExif: ParsedExif | undefined,
  ctx: UploadDedupCheckContext,
): Promise<UploadDedupCheckOutcome> {
  const sourceFile = resolveUploadSourceFile(job);
  const mediaType = deps.uploadService.resolveMediaType(sourceFile);
  if (!isContentHashDedupEligible(mediaType) || job.forceDuplicateUpload) {
    return 'ineligible';
  }

  let contentHash = job.contentHash;
  let hashAlgo = job.contentHashAlgo;
  if (!contentHash) {
    deps.jobState.setPhase(jobId, 'hashing');
    const computed = await computeUploadContentHash(sourceFile, parsedExif, mediaType);
    contentHash = computed.contentHash;
    hashAlgo = computed.hashAlgo;
    deps.jobState.updateJob(jobId, { contentHash, contentHashAlgo: hashAlgo });
  }

  // A tray group can be registered while the hash was being computed, which parks the job. Dedup
  // still runs, but relabelling a held job is what erased the gate and stranded it (F-14).
  const afterHash = deps.jobState.findJob(jobId);
  if (!afterHash || !isHeldForDisambiguation(afterHash)) {
    deps.jobState.setPhase(jobId, 'dedup_check');
  }
  const currentUserId = ctx.getCurrentUserId();

  const inflightBeforeDb = handleInflightDedupMatch(
    deps,
    jobId,
    job,
    contentHash,
    currentUserId,
    ctx,
  );
  if (inflightBeforeDb) {
    return inflightBeforeDb;
  }

  const match = await ctx.checkDedupHash(contentHash);
  if (match) {
    const result = applyDedupMatch({
      jobId,
      job,
      contentHash,
      match,
      currentUserId,
      deps: {
        setPhase: (id, phase) => deps.jobState.setPhase(id, phase),
        updateJob: (id, patch) => deps.jobState.updateJob(id, patch),
        markDone: (id) => deps.queue.markDone(id),
      },
      ctx,
    });
    return result;
  }

  const inflightAfterDb = handleInflightDedupMatch(
    deps,
    jobId,
    job,
    contentHash,
    currentUserId,
    ctx,
  );
  if (inflightAfterDb) {
    return inflightAfterDb;
  }

  if (currentUserId) {
    const reserved = tryRegisterInflightDedupHash(contentHash, {
      jobId,
      registeredByUserId: currentUserId,
    });
    if (!reserved) {
      const raced = handleInflightDedupMatch(deps, jobId, job, contentHash, currentUserId, ctx);
      return raced ?? 'no_match';
    }
  }

  return 'no_match';
}
