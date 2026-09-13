/**
 * User tray picks: applyCandidateToGroup, isolate, defer, source sibling unblock.
 * @see docs/specs/component/upload/upload-resolver-tray.md
 */

import { Injectable, Injector, inject } from '@angular/core';
import { UploadJobStateService } from '../support/upload-job-state.service';
import { UploadLocationDisambiguationStoreService } from './upload-location-disambiguation-store.service';
import { UploadLocationPlacementService } from './upload-location-placement.service';
import { UploadLocationResolutionService } from './upload-location-resolution.service';
import { UploadLocationSourceConflictService } from './upload-location-source-conflict.service';
import { UploadLocationTrayFlowService } from './upload-location-tray-flow.service';
import { UploadManagerService } from '../upload-manager.service';
import {
  buildChosenPlacementPatch,
  clearDisambiguationJobFields,
  SOURCE_CONFLICT_NONE_CANDIDATE_ID,
} from './upload-location-precedence.helpers';
import { isGroupBlocked, pickCollapseStage } from './upload-location-resolution.helpers';
import type { DisambiguationResolvedEvent } from '../upload-manager.types';

@Injectable({ providedIn: 'root' })
export class UploadLocationCandidateApplyService {
  private readonly jobState = inject(UploadJobStateService);
  private readonly disambiguationStore = inject(UploadLocationDisambiguationStoreService);
  private readonly sourceConflict = inject(UploadLocationSourceConflictService);
  private readonly placement = inject(UploadLocationPlacementService);
  private readonly trayFlow = inject(UploadLocationTrayFlowService);
  private readonly injector = inject(Injector);

  private resolution(): UploadLocationResolutionService {
    return this.injector.get(UploadLocationResolutionService);
  }

  applyCandidateToGroup(groupId: string, candidateId: string): void {
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group) {
      return;
    }
    const candidate = group.candidates.find((c) => c.id === candidateId);
    if (!candidate) {
      return;
    }
    if (group.disambiguationKind === 'layer_package') {
      void this.trayFlow.applyLayerPackageChoice(group, candidateId);
      return;
    }
    if (group.disambiguationKind === 'admin_level_conflict') {
      void this.trayFlow.applyAreaConflictChoice(group, candidateId);
      return;
    }
    if (group.disambiguationKind === 'source') {
      this.sourceConflict.applySourceCandidateToGroup(group, candidateId, candidate);
      const resolvedEvent: DisambiguationResolvedEvent = {
        batchId: group.batchId,
        groupId: group.id,
        jobIds: [...group.jobIds],
        selectedCandidateId: candidateId,
      };
      this.resolution().notifyDisambiguationResolved(resolvedEvent);
      this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
      this.disambiguationStore.pickNextActiveGroup(group.batchId);
      if (candidateId !== SOURCE_CONFLICT_NONE_CANDIDATE_ID) {
        this.unblockSiblingsAfterSourceConflictSave(group.batchId, group.queryKey);
      }
      return;
    }

    const resolvedGroup = {
      ...group,
      resolutionStatus: 'resolved' as const,
      resolutionGateOpen: false,
      selectedCandidateId: candidateId,
    };
    this.disambiguationStore.patchGroup(resolvedGroup);

    for (const jobId of group.jobIds) {
      const job = this.jobState.findJob(jobId);
      if (!job || job.mediaId) {
        continue;
      }
      this.placement.applyGeocodeCandidateToJob(jobId, job, candidate, group.folderDisplayPath);
      const j = this.jobState.findJob(jobId)!;
      this.jobState.updateJob(jobId, {
        ...buildChosenPlacementPatch(j, 'text', {
          lat: candidate.lat,
          lng: candidate.lng,
        }),
        ...clearDisambiguationJobFields(),
      });
      this.jobState.setPhase(jobId, 'queued');
    }

    this.resolution().notifyDisambiguationResolved({
      batchId: group.batchId,
      groupId: group.id,
      jobIds: [...group.jobIds],
      selectedCandidateId: candidateId,
    });

    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }

  isolateJobFromGroup(groupId: string, jobId: string): void {
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group?.jobIds.includes(jobId)) {
      return;
    }
    const openBefore = this.disambiguationStore.groups().filter((g) => isGroupBlocked(g));
    const stayIndex = Math.max(0, openBefore.findIndex((g) => g.id === groupId));
    const remaining = group.jobIds.filter((id) => id !== jobId);
    if (remaining.length > 0) {
      this.disambiguationStore.patchGroup({
        ...group,
        jobIds: remaining,
        collapseStage: pickCollapseStage(group.candidates, remaining.length),
      });
    } else {
      this.disambiguationStore.removeGroupById(groupId);
    }

    this.resolution().registerDisambiguationGroup(
      {
        batchId: group.batchId,
        queryKey: `${group.queryKey}::isolate:${jobId}`,
        folderDisplayPath: group.folderDisplayPath,
        titleAddress: group.titleAddress,
        jobIds: [jobId],
        candidates: [...group.candidates],
        localityHint: group.localityHint,
        disambiguationKind: group.disambiguationKind,
      },
      { activateTray: false },
    );

    if (remaining.length > 0) {
      this.disambiguationStore.selectGroupId(groupId);
      return;
    }

    const open = this.disambiguationStore.groups().filter((g) => isGroupBlocked(g));
    const isolated = open.find((g) => g.jobIds.length === 1 && g.jobIds[0] === jobId);
    const withoutIsolated = open.filter((g) => g.id !== isolated?.id);
    const nextIndex = Math.min(stayIndex, Math.max(0, withoutIsolated.length - 1));
    this.disambiguationStore.selectGroupId(withoutIsolated[nextIndex]?.id ?? null);
  }

  deferGroup(groupId: string): void {
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group) {
      return;
    }
    const deferred = {
      ...group,
      resolutionGateOpen: false,
      resolutionStatus: 'failed' as const,
    };
    this.disambiguationStore.patchGroup(deferred);
    for (const jobId of group.jobIds) {
      this.jobState.updateJob(jobId, {
        resolutionStatus: 'failed',
        issueKind: 'address_deferred',
      });
      this.jobState.setPhase(jobId, 'missing_data');
    }
    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }

  private groupingKeyFromSourceQueryKey(queryKey: string): string {
    const prefix = 'source|';
    return queryKey.startsWith(prefix) ? queryKey.slice(prefix.length) : queryKey;
  }

  private unblockSiblingsAfterSourceConflictSave(batchId: string, queryKey: string): void {
    const groupingKey = this.groupingKeyFromSourceQueryKey(queryKey);
    for (const job of this.jobState.jobs()) {
      if (job.batchId !== batchId || job.groupingKey !== groupingKey) {
        continue;
      }
      if (job.mediaId) {
        continue;
      }
      if (job.coords && job.phase === 'resolving_location') {
        this.jobState.setPhase(job.id, 'queued');
      }
      if (!job.coords && job.phase === 'resolving_location') {
        const held = this.placement.finalizePlacementForJobSync(job.id);
        const after = this.jobState.findJob(job.id);
        if (!held && after?.coords) {
          this.jobState.setPhase(job.id, 'queued');
        }
      }
    }
    this.injector.get(UploadManagerService).kickQueueAfterLocationGate();
  }
}
