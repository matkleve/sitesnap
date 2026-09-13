/**
 * The disambiguation hold: what makes a job *actually* wait for a resolver tray.
 *
 * Group registration is asynchronous, so it lands while the job is mid-pipeline — usually inside the
 * `await` in the hashing step — and the next step's own `setPhase` then erases the
 * `awaiting_disambiguation` label. A step that decides whether to keep working must therefore read
 * the hold, not the label; parking re-asserts the label so the lane and the resume path agree again.
 *
 * @see docs/specs/service/media-upload-service/upload-manager.phase-fsm.supplement.md § Disambiguation hold
 * @see docs/study/005-upload-pipeline-trace-findings.md F-14
 */

import type { PipelineContext, UploadJob } from '../upload-manager.types';
import type { UploadJobStateService } from './upload-job-state.service';
import type { UploadQueueService } from './upload-queue.service';

export type DisambiguationHoldDeps = {
  jobState: Pick<UploadJobStateService, 'setPhase'>;
  queue: Pick<UploadQueueService, 'markDone'>;
};

/**
 * Is this job holding a resolver-tray slot?
 *
 * Both halves are required: a layer-package re-resolve sets `resolutionStatus: 'pending'` with no
 * group id, and that is work in progress rather than a job waiting for an answer.
 */
export function isHeldForDisambiguation(job: UploadJob): boolean {
  return !!job.disambiguationGroupId && job.resolutionStatus === 'pending';
}

/** Park a held job: the label follows the hold, the queue slot is released, the queue moves on. */
export function parkJobForDisambiguation(
  deps: DisambiguationHoldDeps,
  jobId: string,
  batchId: string,
  ctx: Pick<PipelineContext, 'emitBatchProgress' | 'drainQueue'>,
): void {
  deps.jobState.setPhase(jobId, 'awaiting_disambiguation');
  deps.queue.markDone(jobId);
  ctx.emitBatchProgress(batchId);
  ctx.drainQueue();
}
