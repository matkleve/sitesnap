/**
 * Apply orchestrator group state to jobs (Search Object pre-resolve pipeline).
 * @see docs/specs/service/media-upload-service/upload-address-resolution-pipeline.md
 */

import { Injectable, Injector, inject } from '@angular/core';
import { UploadAddressResolutionOrchestrator } from '../address-resolution/upload-address-resolution.orchestrator';
import { UploadJobStateService } from '../support/upload-job-state.service';
import { UploadLocationGeocodeGroupService } from './upload-location-geocode-group.service';
import { UploadLocationPlacementService } from './upload-location-placement.service';
import { UploadLocationResolutionService } from './upload-location-resolution.service';
import { UploadLocationTrayFlowService } from './upload-location-tray-flow.service';
import type { UploadGroupResolutionState } from '../address-resolution/upload-address-resolution.types';
import {
  buildDisambiguationQueryKey,
  deriveLocalityHint,
  pickCollapseStage,
  pickDiscriminatingField,
} from './upload-location-resolution.helpers';
import {
  summarizeGroupState,
  uploadAddressDebug,
  uploadTraceDecision,
  uploadTraceEnter,
  uploadTraceExit,
} from '../address-resolution/upload-address-resolution.debug';

@Injectable({ providedIn: 'root' })
export class UploadLocationPreResolveOrchestratorService {
  private readonly orchestrator = inject(UploadAddressResolutionOrchestrator);
  private readonly jobState = inject(UploadJobStateService);
  private readonly geocodeGroup = inject(UploadLocationGeocodeGroupService);
  private readonly placement = inject(UploadLocationPlacementService);
  private readonly trayFlow = inject(UploadLocationTrayFlowService);
  private readonly injector = inject(Injector);

  private resolution(): UploadLocationResolutionService {
    return this.injector.get(UploadLocationResolutionService);
  }

  async applyPreResolveFromOrchestrator(
    jobId: string,
  ): Promise<'continue' | 'held' | 'partial'> {
    uploadTraceEnter('ulr', 'applyPreResolveFromOrchestrator', { jobId });
    const job = this.jobState.findJob(jobId);
    if (!job?.groupingKey) {
      uploadTraceDecision('ulr', 'continue — job has no groupingKey', { jobId });
      uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'continue');
      return 'continue';
    }

    let groupState = this.orchestrator.getGroupState(job.batchId, job.groupingKey);
    if (!groupState) {
      uploadAddressDebug('pre-resolve', 'no orchestrator cache for job', {
        jobId,
        batchId: job.batchId,
        groupingKey: job.groupingKey,
      });
      uploadTraceDecision('ulr', 'continue — no orchestrator cache', {
        batchId: job.batchId,
        groupingKey: job.groupingKey,
      });
      uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'continue');
      return 'continue';
    }

    uploadAddressDebug('pre-resolve', 'applyPreResolveFromOrchestrator', {
      jobId,
      initial: summarizeGroupState(groupState),
    });
    uploadTraceDecision('ulr', `orchestrator group status=${groupState.status}`, {
      ...summarizeGroupState(groupState),
    });

    if (groupState.status === 'needsAdminLevelResolution') {
      return this.holdAdminLevelConflictPreResolve(job.batchId, groupState);
    }

    if (groupState.status === 'needsLayerResolution') {
      return this.holdLayerPackagePreResolve(job.batchId, groupState);
    }

    if (groupState.status === 'needsGeocode') {
      groupState = await this.geocodeGroup.ensureGeocodedGroup(job.batchId, job.groupingKey, groupState);
      uploadTraceDecision('ulr', `after geocode status=${groupState.status}`, summarizeGroupState(groupState));
    }

    return this.continueAfterGeocodePreResolve(job, groupState);
  }

  private holdAdminLevelConflictPreResolve(
    batchId: string,
    groupState: UploadGroupResolutionState,
  ): 'held' {
    uploadTraceDecision('ulr', 'held — admin_level_conflict tray before geocode', {
      adminConflictQueryKey: groupState.adminConflictQueryKey,
    });
    this.trayFlow.registerAdminLevelConflictGroup(batchId, groupState);
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held (admin_level_conflict)');
    return 'held';
  }

  private holdLayerPackagePreResolve(
    batchId: string,
    groupState: UploadGroupResolutionState,
  ): 'held' {
    uploadTraceDecision('ulr', 'held — layer_package tray before geocode', {
      layerConflictQueryKey: groupState.layerConflictQueryKey,
    });
    this.trayFlow.registerLayerPackageGroup(batchId, groupState);
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held (layer_package)');
    return 'held';
  }

  private continueAfterGeocodePreResolve(
    job: NonNullable<ReturnType<UploadJobStateService['findJob']>>,
    groupState: UploadGroupResolutionState,
  ): 'continue' | 'held' | 'partial' {
    if (groupState.status === 'needsTray') {
      return this.handleNeedsTrayPreResolve(job.batchId, groupState);
    }
    if (groupState.status === 'resolved' && groupState.candidate) {
      return this.handleResolvedPreResolve(job.id, groupState);
    }
    if (groupState.status === 'partial') {
      return this.handlePartialPreResolve(groupState);
    }
    if (groupState.status === 'ambiguous' && groupState.candidates?.length) {
      return this.handleAmbiguousPreResolve(job, groupState);
    }
    uploadTraceDecision('ulr', 'partial — fallback markGroupPartial', summarizeGroupState(groupState));
    this.markGroupPartial(groupState);
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'partial');
    return 'partial';
  }

  private handleNeedsTrayPreResolve(
    batchId: string,
    groupState: UploadGroupResolutionState,
  ): 'continue' | 'held' {
    if (this.placement.tryApplyExifPlacementForWeakBranchC(groupState)) {
      uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'continue (exif weak branch c)');
      return 'continue';
    }
    if (groupState.containmentCheck) {
      uploadTraceDecision('ulr', 'held — register containment_check tray', {
        groupingKey: groupState.groupingKey,
      });
      this.trayFlow.registerContainmentCheckGroup(batchId, groupState);
      uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held (containment_check)');
      return 'held';
    }
    uploadTraceDecision('ulr', 'held — register tray step', {
      trayStep: groupState.trayStep,
      geocodeBranch: groupState.geocodeBranch,
    });
    this.trayFlow.registerTrayStepGroup(batchId, groupState);
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held');
    return 'held';
  }

  /**
   * One geocode covers the whole group, so the candidate is applied to every job in it. A source
   * conflict is per job, though — only a job carrying both a text and an EXIF pin is in that tray —
   * so a sibling's hold must neither become the asking job's verdict nor stop the loop before the
   * remaining jobs get their placement.
   * @see docs/study/005-upload-pipeline-trace-findings.md#f-16
   */
  private handleResolvedPreResolve(
    jobId: string,
    groupState: UploadGroupResolutionState,
  ): 'continue' | 'held' {
    uploadTraceDecision('ulr', 'resolved — apply candidate to jobs', {
      candidateId: groupState.candidate!.id,
      addressLabel: groupState.candidate!.addressLabel,
    });
    let askingJobHeld = false;
    for (const id of groupState.jobIds) {
      const j = this.jobState.findJob(id);
      if (!j) {
        continue;
      }
      this.placement.applyGeocodeCandidateToJob(id, j, groupState.candidate!, groupState.folderDisplayPath);
      if (this.placement.finalizePlacementForJob(id) && id === jobId) {
        askingJobHeld = true;
      }
    }
    const outcome = askingJobHeld ? 'held' : 'continue';
    uploadTraceExit(
      'ulr',
      'applyPreResolveFromOrchestrator',
      askingJobHeld ? 'held (source conflict)' : 'continue',
    );
    return outcome;
  }

  private handlePartialPreResolve(groupState: UploadGroupResolutionState): 'partial' {
    uploadTraceDecision('ulr', 'partial — markGroupPartial', { groupingKey: groupState.groupingKey });
    this.markGroupPartial(groupState);
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'partial');
    return 'partial';
  }

  private handleAmbiguousPreResolve(
    job: NonNullable<ReturnType<UploadJobStateService['findJob']>>,
    groupState: UploadGroupResolutionState,
  ): 'held' {
    if (groupState.geocodeBranch === 'branch_c') {
      uploadTraceDecision('ulr', 'held — branch_c ambiguous → city_step tray 1a', {
        candidateCount: groupState.candidates!.length,
        discriminatingField: groupState.discriminatingField,
      });
      const discriminatingField =
        groupState.discriminatingField ??
        pickDiscriminatingField(groupState.candidates!) ??
        undefined;
      this.resolution().registerDisambiguationGroup({
        batchId: job.batchId,
        queryKey: buildDisambiguationQueryKey(job.groupingKey!),
        folderDisplayPath: groupState.folderDisplayPath,
        titleAddress: groupState.titleAddressLabel,
        jobIds: groupState.jobIds,
        candidates: groupState.candidates!,
        localityHint: deriveLocalityHint(job.relativePath),
        disambiguationKind: 'city_step',
        trayStep: '1a',
        discriminatingField,
        collapseStage: pickCollapseStage(groupState.candidates!, groupState.jobIds.length),
      });
      uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held');
      return 'held';
    }
    uploadTraceDecision('ulr', 'held — ambiguous geocode tray step 3', {
      candidateCount: groupState.candidates!.length,
    });
    this.resolution().registerDisambiguationGroup({
      batchId: job.batchId,
      queryKey: buildDisambiguationQueryKey(job.groupingKey!),
      folderDisplayPath: groupState.folderDisplayPath,
      titleAddress: groupState.titleAddressLabel,
      jobIds: groupState.jobIds,
      candidates: groupState.candidates!,
      localityHint: deriveLocalityHint(job.relativePath),
      disambiguationKind: 'geocode',
      trayStep: '3',
    });
    uploadTraceExit('ulr', 'applyPreResolveFromOrchestrator', 'held');
    return 'held';
  }

  private markGroupPartial(group: UploadGroupResolutionState): void {
    for (const jobId of group.jobIds) {
      this.jobState.updateJob(jobId, {
        resolutionStatus: 'failed',
        pendingPartialLocation: true,
        disambiguationGroupId: undefined,
      });
    }
  }
}
