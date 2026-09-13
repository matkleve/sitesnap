/**
 * Batch Search Object classification and resolution cache for upload intake.
 * @see docs/specs/service/media-upload-service/upload-address-resolution-pipeline.md
 */

import { Injectable, inject } from '@angular/core';
import { LocalGeoDataAdapter } from '../../location-path-parser/local-geo-data.adapter';
import { resolveLayersForJob } from '../../location-path-parser/upload-search-object.layer-map';
import { isSearchObjectMeaningless } from '../../location-path-parser/upload-search-object.builder';
import { deriveFolderDisplayPath } from '../location/upload-location-resolution.helpers';
import { UploadLocationLookupAdapter } from '../adapters/upload-location-lookup.adapter';
import { UploadProjectLocationsAdapter } from '../adapters/upload-project-locations.adapter';
import {
  buildGroupPresentation,
  evaluateLocalResolution,
  locationRowToCandidate,
} from '../location/upload-location-resolution.helpers';
import { UploadJobStateService } from '../support/upload-job-state.service';
import type {
  UploadGroupResolutionState,
  UploadSearchObject,
} from './upload-address-resolution.types';
import {
  buildAdminConflictQueryKey,
  buildAdminConflictSignature,
} from '../../location-path-parser/upload-area-evidence.helpers';
import {
  summarizeGroupState,
  summarizeSearchObject,
  uploadAddressDebug,
  uploadSoMutation,
  uploadTraceDecision,
  uploadTraceEnter,
  uploadTraceExit,
} from './upload-address-resolution.debug';

@Injectable({ providedIn: 'root' })
export class UploadAddressResolutionOrchestrator {
  private readonly geoData = inject(LocalGeoDataAdapter);
  private readonly lookup = inject(UploadLocationLookupAdapter);
  private readonly projectLocations = inject(UploadProjectLocationsAdapter);
  private readonly jobState = inject(UploadJobStateService);

  private readonly batchCaches = new Map<string, Map<string, UploadGroupResolutionState>>();
  private geoLoaded: Promise<{
    states: Awaited<ReturnType<LocalGeoDataAdapter['getBundeslaender']>>;
    municipalities: Awaited<ReturnType<LocalGeoDataAdapter['getGemeinden']>>;
    postcodeMap: Awaited<ReturnType<LocalGeoDataAdapter['getPlzMap']>>;
  }> | null = null;

  clearBatch(batchId: string): void {
    this.batchCaches.delete(batchId);
  }

  getGroupState(batchId: string, groupingKey: string): UploadGroupResolutionState | undefined {
    return this.batchCaches.get(batchId)?.get(groupingKey);
  }

  /** Find orchestrator cache entry containing jobId (layer_package uses layerConflictQueryKey as key). */
  getGroupStateForJob(batchId: string, jobId: string): UploadGroupResolutionState | undefined {
    const cache = this.batchCaches.get(batchId);
    if (!cache) {
      return undefined;
    }
    for (const state of cache.values()) {
      if (state.jobIds.includes(jobId)) {
        return state;
      }
    }
    return undefined;
  }

  listGroupStates(batchId: string): UploadGroupResolutionState[] {
    const cache = this.batchCaches.get(batchId);
    return cache ? [...cache.values()] : [];
  }

  getGroupingKeyForJob(jobId: string): string | undefined {
    return this.jobState.findJob(jobId)?.groupingKey;
  }

  async classifyBatch(batchId: string): Promise<void> {
    uploadTraceEnter('orchestrator', 'classifyBatch', { batchId });
    const jobs = this.jobState.jobs().filter((j) => j.batchId === batchId);
    if (!jobs.length) {
      uploadTraceDecision('orchestrator', 'classifyBatch — no jobs in batch');
      uploadTraceExit('orchestrator', 'classifyBatch', 'empty');
      return;
    }

    uploadAddressDebug('orchestrator', 'classifyBatch start', {
      batchId,
      jobCount: jobs.length,
    });

    const geo = await this.loadGeo();
    const geoFull = { ...geo, postcodeMap: geo.postcodeMap };
    const leafObjects: Array<{ jobId: string; so: UploadSearchObject }> = [];
    const layerConflictAccum = new Map<
      string,
      {
        jobIds: string[];
        searchObject: UploadSearchObject;
        addressLayers: UploadGroupResolutionState['addressLayers'];
        conflictingEntries: NonNullable<UploadGroupResolutionState['addressLayers']>;
        folderDisplayPath: string;
        titleAddressLabel: string;
      }
    >();
    const adminConflictAccum = new Map<
      string,
      {
        jobIds: string[];
        searchObject: UploadSearchObject;
        areaConflicts: NonNullable<UploadSearchObject['areaConflicts']>;
        folderDisplayPath: string;
        titleAddressLabel: string;
      }
    >();

    for (const job of jobs) {
      const relativePath = job.relativePath ?? job.file.name;
      const folderDisplayPath = deriveFolderDisplayPath(relativePath);
      const layerResult = resolveLayersForJob(
        relativePath,
        job.file.name,
        geoFull,
        folderDisplayPath,
      );
      const so = layerResult.searchObject;
      const { titleAddressLabel } = buildGroupPresentation(so);

      uploadAddressDebug('orchestrator', 'search object built', {
        jobId: job.id,
        ...summarizeSearchObject(so),
        folderDisplayPath,
        titleAddressLabel,
        packageConflict: !!layerResult.packageConflict,
      });

      if (so.areaConflicts?.length) {
        const signature = buildAdminConflictSignature(so.areaConflicts);
        const key = buildAdminConflictQueryKey(signature);
        const existing = adminConflictAccum.get(key);
        if (existing) {
          if (!existing.jobIds.includes(job.id)) {
            existing.jobIds.push(job.id);
          }
        } else {
          adminConflictAccum.set(key, {
            jobIds: [job.id],
            searchObject: so,
            areaConflicts: so.areaConflicts,
            folderDisplayPath,
            titleAddressLabel,
          });
        }
        this.jobState.updateJob(job.id, {
          groupingKey: key,
          folderDisplayPath,
          titleAddress: titleAddressLabel,
          titleAddressSource: job.titleAddressSource ?? 'folder',
        });
        continue;
      }

      if (layerResult.packageConflict) {
        const key = layerResult.packageConflict.layerConflictQueryKey;
        const existing = layerConflictAccum.get(key);
        if (existing) {
          if (!existing.jobIds.includes(job.id)) {
            existing.jobIds.push(job.id);
          }
        } else {
          layerConflictAccum.set(key, {
            jobIds: [job.id],
            searchObject: so,
            addressLayers: layerResult.layers,
            conflictingEntries: layerResult.packageConflict.conflictingEntries,
            folderDisplayPath,
            titleAddressLabel,
          });
        }
        this.jobState.updateJob(job.id, {
          groupingKey: key,
          folderDisplayPath,
          titleAddress: titleAddressLabel,
          titleAddressSource: job.titleAddressSource ?? 'folder',
        });
        continue;
      }

      if (isSearchObjectMeaningless(so)) {
        uploadAddressDebug('orchestrator', 'skip meaningless SO — no real address signal', {
          jobId: job.id,
          fileName: job.file.name,
          street: so.street,
          country: so.country,
        });
        continue;
      }

      this.jobState.updateJob(job.id, {
        groupingKey: so.groupingKey,
        folderDisplayPath,
        titleAddress: titleAddressLabel,
        titleAddressSource: job.titleAddressSource ?? 'folder',
      });
      uploadSoMutation('classifyBatch', 'job wired from leaf search object', {
        jobId: job.id,
        groupingKey: so.groupingKey,
        after: summarizeSearchObject(so),
        patch: { folderDisplayPath, titleAddress: titleAddressLabel },
      });

      leafObjects.push({ jobId: job.id, so });
    }

    const byKey = new Map<string, { so: UploadSearchObject; jobIds: string[] }>();
    for (const { jobId, so } of leafObjects) {
      const existing = byKey.get(so.groupingKey);
      if (existing) {
        existing.jobIds.push(jobId);
      } else {
        byKey.set(so.groupingKey, { so, jobIds: [jobId] });
      }
    }

    const cache = new Map<string, UploadGroupResolutionState>();

    for (const [areaConflictQueryKey, accum] of adminConflictAccum) {
      const adminState: UploadGroupResolutionState = {
        status: 'needsAreaResolution',
        groupingKey: areaConflictQueryKey,
        jobIds: accum.jobIds,
        searchObject: accum.searchObject,
        folderDisplayPath: accum.folderDisplayPath,
        titleAddressLabel: accum.titleAddressLabel,
        areaConflictQueryKey,
        areaConflicts: accum.areaConflicts,
      };
      cache.set(areaConflictQueryKey, adminState);
      uploadTraceDecision('orchestrator', 'needsAreaResolution — admin field conflict', {
        areaConflictQueryKey,
        jobIds: accum.jobIds,
      });
    }

    for (const [layerConflictQueryKey, accum] of layerConflictAccum) {
      const layerState: UploadGroupResolutionState = {
        status: 'needsLayerResolution',
        groupingKey: layerConflictQueryKey,
        jobIds: accum.jobIds,
        searchObject: accum.searchObject,
        folderDisplayPath: accum.folderDisplayPath,
        titleAddressLabel: accum.titleAddressLabel,
        addressLayers: accum.addressLayers,
        layerConflictQueryKey,
      };
      cache.set(layerConflictQueryKey, layerState);
      uploadTraceDecision('orchestrator', 'needsLayerResolution — package conflict before geocode', {
        layerConflictQueryKey,
        jobIds: accum.jobIds,
      });
    }

    const sampleJob = jobs[0];
    const projectId = sampleJob?.projectId;
    let projectCentroid = null as ReturnType<UploadProjectLocationsAdapter['pickCentroid']>;
    if (projectId) {
      const rows = await this.projectLocations.listProjectLocations(projectId);
      projectCentroid = this.projectLocations.pickCentroid(rows);
    }

    for (const [groupingKey, { so, jobIds }] of byKey) {
      const { folderDisplayPath, titleAddressLabel } = buildGroupPresentation(so);
      const local = evaluateLocalResolution(so, projectCentroid);

      uploadAddressDebug('orchestrator', 'group evaluate', {
        groupingKey,
        jobIds,
        localGate: local,
        projectCentroid,
        searchObject: summarizeSearchObject(so),
      });

      if (local === 'postcode_blocked' || local === 'incomplete') {
        uploadTraceDecision('orchestrator', `group partial — local gate ${local}`, {
          groupingKey,
          jobIds,
        });
        const partialState: UploadGroupResolutionState = {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: undefined,
        };
        cache.set(groupingKey, partialState);
        uploadAddressDebug('orchestrator', 'group → partial (local gate)', summarizeGroupState(partialState));
        continue;
      }

      if (local === 'branch_c') {
        uploadTraceDecision('orchestrator', 'group needsGeocode — branch_c (street only, no locality)', {
          groupingKey,
          street: so.street,
          jobIds,
        });
        const branchCState: UploadGroupResolutionState = {
          status: 'needsGeocode',
          groupingKey,
          jobIds,
          searchObject: {
            ...so,
            country: so.country ?? 'AT',
          },
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'branch_c',
        };
        cache.set(groupingKey, branchCState);
        uploadAddressDebug('orchestrator', 'group → needsGeocode (branch C)', summarizeGroupState(branchCState));
        continue;
      }

      if (local === 'metadata_only') {
        uploadTraceDecision('orchestrator', 'group partial — metadata_only', { groupingKey, jobIds });
        const metaState: UploadGroupResolutionState = {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'metadata_only',
        };
        cache.set(groupingKey, metaState);
        continue;
      }

      const row = await this.lookup.findBySearchObject(so);
      if (row) {
        uploadTraceDecision('orchestrator', 'group resolved — DB location hit', {
          groupingKey,
          locationId: row['id'],
          geocodeBranch: local,
        });
        const resolvedState: UploadGroupResolutionState = {
          status: 'resolved',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
          candidate: locationRowToCandidate(row),
        };
        cache.set(groupingKey, resolvedState);
        uploadAddressDebug('orchestrator', 'group → resolved (db)', summarizeGroupState(resolvedState));
        continue;
      }

      const needsGeocodeState: UploadGroupResolutionState = {
        status: 'needsGeocode',
        groupingKey,
        jobIds,
        searchObject: so,
        folderDisplayPath,
        titleAddressLabel,
        geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
        projectCentroid: local === 'branch_b' ? (projectCentroid ?? undefined) : undefined,
      };
      cache.set(groupingKey, needsGeocodeState);
      uploadTraceDecision('orchestrator', 'group needsGeocode — no DB row', {
        groupingKey,
        geocodeBranch: needsGeocodeState.geocodeBranch,
        jobIds,
      });
      uploadAddressDebug('orchestrator', 'group → needsGeocode', summarizeGroupState(needsGeocodeState));
    }

    this.batchCaches.set(batchId, cache);
    uploadTraceExit('orchestrator', 'classifyBatch', `groups=${cache.size}`);
    uploadAddressDebug('orchestrator', 'classifyBatch done', {
      batchId,
      groupCount: cache.size,
      groups: [...cache.entries()].map(([key, state]) => ({
        groupingKey: key,
        status: state.status,
        jobCount: state.jobIds.length,
      })),
    });
  }

  patchGroupState(batchId: string, state: UploadGroupResolutionState): void {
    const cache = this.batchCaches.get(batchId);
    if (!cache) {
      return;
    }
    cache.set(state.groupingKey, state);
  }

  /** Drop layer-conflict cache entry after user picks a package. */
  removeGroupState(batchId: string, groupingKey: string): void {
    this.batchCaches.get(batchId)?.delete(groupingKey);
  }

  /**
   * Re-classify flat SO groups after admin_level_conflict tray.
   */
  async integrateResolvedAdminGroups(
    batchId: string,
    oldAdminConflictKey: string,
    groups: Array<{
      groupingKey: string;
      jobIds: string[];
      searchObject: UploadSearchObject;
      folderDisplayPath: string;
      titleAddressLabel: string;
    }>,
  ): Promise<void> {
    const cache = this.batchCaches.get(batchId) ?? new Map<string, UploadGroupResolutionState>();
    cache.delete(oldAdminConflictKey);

    const sampleJob = this.jobState.findJob(groups[0]?.jobIds[0] ?? '');
    let projectCentroid = null as ReturnType<UploadProjectLocationsAdapter['pickCentroid']>;
    if (sampleJob?.projectId) {
      const rows = await this.projectLocations.listProjectLocations(sampleJob.projectId);
      projectCentroid = this.projectLocations.pickCentroid(rows);
    }

    for (const g of groups) {
      const { groupingKey, jobIds, searchObject: so, folderDisplayPath, titleAddressLabel } = g;
      const local = evaluateLocalResolution(so, projectCentroid);

      if (local === 'postcode_blocked' || local === 'incomplete') {
        cache.set(groupingKey, {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
        });
        continue;
      }

      if (local === 'branch_c') {
        cache.set(groupingKey, {
          status: 'needsGeocode',
          groupingKey,
          jobIds,
          searchObject: { ...so, country: so.country ?? 'AT' },
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'branch_c',
          resolvedFromAdminConflict: true,
        });
        continue;
      }

      if (local === 'metadata_only') {
        cache.set(groupingKey, {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'metadata_only',
        });
        continue;
      }

      const row = await this.lookup.findBySearchObject(so);
      if (row) {
        cache.set(groupingKey, {
          status: 'resolved',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
          candidate: locationRowToCandidate(row),
        });
        continue;
      }

      cache.set(groupingKey, {
        status: 'needsGeocode',
        groupingKey,
        jobIds,
        searchObject: so,
        folderDisplayPath,
        titleAddressLabel,
        geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
        projectCentroid: local === 'branch_b' ? (projectCentroid ?? undefined) : undefined,
        resolvedFromAdminConflict: true,
      });
    }

    this.batchCaches.set(batchId, cache);
  }

  /**
   * Re-classify flat SO groups after layer_package tray (no second conflict detect).
   * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#orchestrator-status
   */
  async integrateResolvedLayerGroups(
    batchId: string,
    oldLayerConflictKey: string,
    groups: Array<{
      groupingKey: string;
      jobIds: string[];
      searchObject: UploadSearchObject;
      folderDisplayPath: string;
      titleAddressLabel: string;
    }>,
  ): Promise<void> {
    const cache = this.batchCaches.get(batchId) ?? new Map<string, UploadGroupResolutionState>();
    cache.delete(oldLayerConflictKey);

    const sampleJob = this.jobState.findJob(groups[0]?.jobIds[0] ?? '');
    let projectCentroid = null as ReturnType<UploadProjectLocationsAdapter['pickCentroid']>;
    if (sampleJob?.projectId) {
      const rows = await this.projectLocations.listProjectLocations(sampleJob.projectId);
      projectCentroid = this.projectLocations.pickCentroid(rows);
    }

    for (const g of groups) {
      const { groupingKey, jobIds, searchObject: so, folderDisplayPath, titleAddressLabel } = g;
      const local = evaluateLocalResolution(so, projectCentroid);

      if (local === 'postcode_blocked' || local === 'incomplete') {
        cache.set(groupingKey, {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
        });
        continue;
      }

      if (local === 'branch_c') {
        cache.set(groupingKey, {
          status: 'needsGeocode',
          groupingKey,
          jobIds,
          searchObject: { ...so, country: so.country ?? 'AT' },
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'branch_c',
        });
        continue;
      }

      if (local === 'metadata_only') {
        cache.set(groupingKey, {
          status: 'partial',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: 'metadata_only',
        });
        continue;
      }

      const row = await this.lookup.findBySearchObject(so);
      if (row) {
        cache.set(groupingKey, {
          status: 'resolved',
          groupingKey,
          jobIds,
          searchObject: so,
          folderDisplayPath,
          titleAddressLabel,
          geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
          candidate: locationRowToCandidate(row),
        });
        continue;
      }

      cache.set(groupingKey, {
        status: 'needsGeocode',
        groupingKey,
        jobIds,
        searchObject: so,
        folderDisplayPath,
        titleAddressLabel,
        geocodeBranch: local === 'branch_b' ? 'branch_b' : 'branch_a',
        projectCentroid: local === 'branch_b' ? (projectCentroid ?? undefined) : undefined,
      });
    }

    this.batchCaches.set(batchId, cache);
  }

  private loadGeo() {
    if (!this.geoLoaded) {
      this.geoLoaded = Promise.all([
        this.geoData.getBundeslaender(),
        this.geoData.getGemeinden(),
        this.geoData.getPlzMap(),
      ]).then(([states, municipalities, postcodeMap]) => ({
        states,
        municipalities,
        postcodeMap,
      }));
    }
    return this.geoLoaded;
  }
}
