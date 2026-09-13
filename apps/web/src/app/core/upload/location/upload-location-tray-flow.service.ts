/**
 * Tray registration and Step 1A/1B / layer-package flows.
 * @see docs/specs/component/upload/upload-resolver-tray.md
 */

import { Injectable, Injector, inject } from '@angular/core';
import { GeocodingService } from '../../geocoding/geocoding.service';
import { LocalGeoDataAdapter } from '../../location-path-parser/local-geo-data.adapter';
import {
  detectPackageConflicts,
  formatPackageLabel,
  layerKeyToCandidateId,
} from '../../location-path-parser/upload-search-object.layer-map';
import { UploadAddressResolutionOrchestrator } from '../address-resolution/upload-address-resolution.orchestrator';
import { UploadJobStateService } from '../support/upload-job-state.service';
import { UploadLocationDisambiguationStoreService } from './upload-location-disambiguation-store.service';
import { UploadLocationResolutionService } from './upload-location-resolution.service';
import type { UploadGroupResolutionState } from '../address-resolution/upload-address-resolution.types';
import {
  buildDisambiguationQueryKey,
  pickCollapseStage,
  pickDiscriminatingField,
} from './upload-location-resolution.helpers';
import {
  buildAdminConflictQueryKey,
  buildAdminConflictSignature,
} from '../../location-path-parser/upload-area-evidence.helpers';
import {
  applyAdminLevelSelectionsToSearchObject,
  buildAdminConflictCandidates,
  parseAdminLevelCandidateId,
} from './upload-location-area-choice.util';
import {
  bucketLayerPackageJobsByGroupingKey,
  resolveLayerPackageJobs,
} from './upload-location-layer-package-choice.util';
import type { AreaFieldKey } from '../address-resolution/upload-area-evidence.types';
import { CONTAINMENT_CHECK_ENTER_DIFFERENT_CANDIDATE_ID } from './upload-location-geocode-outcome.util';
import type {
  DisambiguationResolvedEvent,
  UploadAddressCandidate,
  UploadDisambiguationGroup,
} from '../upload-manager.types';

@Injectable({ providedIn: 'root' })
export class UploadLocationTrayFlowService {
  private readonly geocoding = inject(GeocodingService);
  private readonly orchestrator = inject(UploadAddressResolutionOrchestrator);
  private readonly jobState = inject(UploadJobStateService);
  private readonly geoData = inject(LocalGeoDataAdapter);
  private readonly disambiguationStore = inject(UploadLocationDisambiguationStoreService);
  private readonly injector = inject(Injector);

  private geoLoaded: Promise<{
    states: Awaited<ReturnType<LocalGeoDataAdapter['getBundeslaender']>>;
    municipalities: Awaited<ReturnType<LocalGeoDataAdapter['getGemeinden']>>;
    postcodeMap: Awaited<ReturnType<LocalGeoDataAdapter['getPlzMap']>>;
  }> | null = null;

  private resolution(): UploadLocationResolutionService {
    return this.injector.get(UploadLocationResolutionService);
  }

  private loadGeoData(): Promise<{
    states: Awaited<ReturnType<LocalGeoDataAdapter['getBundeslaender']>>;
    municipalities: Awaited<ReturnType<LocalGeoDataAdapter['getGemeinden']>>;
    postcodeMap: Awaited<ReturnType<LocalGeoDataAdapter['getPlzMap']>>;
  }> {
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

  /**
   * Register layer_package trays after classifyBatch — before Photon.
   * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#tray-registration
   */
  registerLayerPackageGroupsAfterClassify(batchId: string): void {
    this.registerAreaConflictGroupsAfterClassify(batchId);
    const states = this.orchestrator
      .listGroupStates(batchId)
      .filter((s) => s.status === 'needsLayerResolution');
    for (const state of states) {
      this.registerLayerPackageGroup(batchId, state);
    }
  }

  registerAreaConflictGroupsAfterClassify(batchId: string): void {
    const states = this.orchestrator
      .listGroupStates(batchId)
      .filter((s) => s.status === 'needsAreaResolution');
    for (const state of states) {
      this.registerAreaConflictGroup(batchId, state);
    }
  }

  registerAreaConflictGroup(batchId: string, state: UploadGroupResolutionState): void {
    const queryKey = state.areaConflictQueryKey ?? state.groupingKey;
    const conflicts = state.areaConflicts ?? state.searchObject.areaConflicts ?? [];
    const candidates = buildAdminConflictCandidates(conflicts).map((c) => ({
      id: c.id,
      addressLabel: c.addressLabel,
      lat: 0,
      lng: 0,
    }));
    this.resolution().registerDisambiguationGroup({
      batchId,
      queryKey,
      folderDisplayPath: state.folderDisplayPath,
      titleAddress: state.titleAddressLabel,
      jobIds: state.jobIds,
      candidates,
      disambiguationKind: 'admin_level_conflict',
      areaConflicts: conflicts,
    });
  }

  registerContainmentCheckGroup(batchId: string, state: UploadGroupResolutionState): void {
    const queryKey = `containment|${state.groupingKey}`;
    const candidates = state.candidates ?? [];
    this.resolution().registerDisambiguationGroup({
      batchId,
      queryKey,
      folderDisplayPath: state.folderDisplayPath,
      titleAddress: state.titleAddressLabel,
      jobIds: state.jobIds,
      candidates,
      disambiguationKind: 'containment_check',
      trayStep: state.trayStep,
    });
  }

  applyContainmentCheckChoice(group: UploadDisambiguationGroup, candidateId: string): void {
    if (candidateId === CONTAINMENT_CHECK_ENTER_DIFFERENT_CANDIDATE_ID) {
      this.openContainmentFallbackTray(group);
      return;
    }

    for (const jobId of group.jobIds) {
      this.jobState.updateJob(jobId, {
        resolutionStatus: 'resolved',
        pendingPartialLocation: true,
        disambiguationGroupId: undefined,
      });
    }

    this.disambiguationStore.patchGroup({
      ...group,
      resolutionStatus: 'resolved',
      resolutionGateOpen: false,
      selectedCandidateId: candidateId,
    });

    const resolvedEvent: DisambiguationResolvedEvent = {
      batchId: group.batchId,
      groupId: group.id,
      jobIds: [...group.jobIds],
      selectedCandidateId: candidateId,
    };
    this.resolution().notifyDisambiguationResolved(resolvedEvent);
    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }

  private resolveContainmentGroupingKey(
    group: UploadDisambiguationGroup,
    sampleJob?: ReturnType<UploadJobStateService['findJob']>,
  ): string | undefined {
    if (sampleJob?.groupingKey) {
      return sampleJob.groupingKey;
    }
    const prefix = 'containment|';
    return group.queryKey.startsWith(prefix) ? group.queryKey.slice(prefix.length) : undefined;
  }

  private openContainmentFallbackTray(group: UploadDisambiguationGroup): void {
    const sampleJob = this.jobState.findJob(group.jobIds[0]);
    const groupingKey = this.resolveContainmentGroupingKey(group, sampleJob);
    const groupState = groupingKey
      ? this.orchestrator.getGroupState(group.batchId, groupingKey)
      : undefined;
    if (!groupState) {
      this.resolution().deferGroup(group.id);
      return;
    }
    this.disambiguationStore.patchGroup({
      ...group,
      resolutionStatus: 'resolved',
      resolutionGateOpen: false,
      selectedCandidateId: CONTAINMENT_CHECK_ENTER_DIFFERENT_CANDIDATE_ID,
    });
    const fallbackState: UploadGroupResolutionState = {
      ...groupState,
      status: 'needsTray',
      trayStep: '1a',
      containmentCheck: false,
      candidates: [],
    };
    this.orchestrator.patchGroupState(group.batchId, fallbackState);
    this.registerTrayStepGroup(group.batchId, fallbackState);
    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }

  registerLayerPackageGroup(batchId: string, state: UploadGroupResolutionState): void {
    const queryKey = state.layerConflictQueryKey ?? state.groupingKey;
    const layers = state.addressLayers ?? [];
    const conflict = detectPackageConflicts(layers, state.folderDisplayPath);
    const entries = conflict?.conflictingEntries ?? layers.filter((e) =>
      [e.parsed.street, e.parsed.houseNumber, e.parsed.staircase, e.parsed.door].some(
        (v) => !!v?.trim(),
      ),
    );
    const candidates: UploadAddressCandidate[] = entries.map((entry) => ({
      id: layerKeyToCandidateId(entry.layerKey),
      addressLabel: formatPackageLabel(entry),
      lat: 0,
      lng: 0,
    }));
    this.resolution().registerDisambiguationGroup({
      batchId,
      queryKey,
      folderDisplayPath: state.folderDisplayPath,
      titleAddress: state.titleAddressLabel,
      jobIds: state.jobIds,
      candidates,
      disambiguationKind: 'layer_package',
    });
  }

  registerTrayStepGroup(batchId: string, groupState: UploadGroupResolutionState): void {
    const step = groupState.trayStep ?? '1a';
    const kind = step === '1b' ? 'house_step' : 'city_step';
    const candidates = groupState.candidates ?? [];
    const discriminatingField =
      groupState.discriminatingField ??
      (candidates.length ? pickDiscriminatingField(candidates) ?? undefined : undefined);
    this.resolution().registerDisambiguationGroup({
      batchId,
      queryKey: buildDisambiguationQueryKey(groupState.groupingKey),
      folderDisplayPath: groupState.folderDisplayPath,
      titleAddress: groupState.titleAddressLabel,
      jobIds: groupState.jobIds,
      candidates,
      disambiguationKind: kind,
      trayStep: step,
      confirmedCity: groupState.confirmedCity ?? groupState.candidate?.city ?? null,
      step1bGate: step === '1b' ? 'active' : 'disabled',
      projectCentroid: groupState.projectCentroid,
      discriminatingField,
      collapseStage: candidates.length
        ? pickCollapseStage(candidates, groupState.jobIds.length)
        : undefined,
    });
    if (step === '1b' && groupState.confirmedCity) {
      void this.loadHouseNumbersForGroup(
        this.disambiguationStore.groups().find(
          (g) =>
            g.batchId === batchId &&
            g.queryKey === buildDisambiguationQueryKey(groupState.groupingKey),
        )?.id,
      );
    }
  }

  private async loadHouseNumbersForGroup(groupId: string | undefined): Promise<void> {
    if (!groupId) {
      return;
    }
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group?.confirmedCity?.trim()) {
      return;
    }
    await this.confirmTrayCity(groupId, group.confirmedCity);
  }

  /** Step 1A: user confirmed city → unlock 1B and load house numbers. */
  async confirmTrayCity(groupId: string, city: string): Promise<void> {
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group) {
      return;
    }
    const trimmed = city.trim();
    if (!trimmed) {
      return;
    }
    const job = this.jobState.findJob(group.jobIds[0]);
    const so = job?.groupingKey
      ? this.orchestrator.getGroupState(group.batchId, job.groupingKey)?.searchObject
      : undefined;
    const street = so?.street?.trim() ?? group.titleAddress.trim();
    const countryCode = so?.country?.trim().toLowerCase() ?? 'at';
    const hits = await this.geocoding.searchStreetHouseNumbers(
      { street, city: trimmed, countryCode },
      { limit: 50, countrycodes: [countryCode] },
    );
    const houseCandidates: UploadAddressCandidate[] = hits.map((h, i) => ({
      id: `hn-${i}-${h.address?.house_number ?? i}`,
      addressLabel: h.displayName,
      lat: h.lat,
      lng: h.lng,
      city: trimmed,
      score: h.importance,
    }));
    this.disambiguationStore.patchGroup({
      ...group,
      trayStep: '1b',
      confirmedCity: trimmed,
      step1bGate: 'active',
      disambiguationKind: 'house_step',
      houseNumberCandidates: houseCandidates,
      candidates: houseCandidates,
    });
  }

  /** Step 1B: apply selected house number or street centroid. */
  applyTrayHouseSelection(groupId: string, candidateId: string | null, streetCentroid = false): void {
    const group = this.disambiguationStore.groups().find((g) => g.id === groupId);
    if (!group) {
      return;
    }
    if (streetCentroid) {
      void this.applyStreetCentroidSelection(group);
      return;
    }
    if (candidateId) {
      this.resolution().applyCandidateToGroup(groupId, candidateId);
    }
  }

  /** NF-18: "No number needed" resolves to street centroid — not deferGroup. */
  private async applyStreetCentroidSelection(group: UploadDisambiguationGroup): Promise<void> {
    const candidate = await this.buildStreetCentroidCandidate(group);
    if (!candidate) {
      return;
    }
    this.disambiguationStore.patchGroup({
      ...group,
      candidates: [...group.candidates, candidate],
    });
    this.resolution().applyCandidateToGroup(group.id, candidate.id);
  }

  private async buildStreetCentroidCandidate(
    group: UploadDisambiguationGroup,
  ): Promise<UploadAddressCandidate | null> {
    const houseCandidates = group.houseNumberCandidates?.length
      ? group.houseNumberCandidates
      : group.candidates;
    const withCoords = houseCandidates.filter(
      (candidate) =>
        Number.isFinite(candidate.lat) &&
        Number.isFinite(candidate.lng) &&
        (candidate.lat !== 0 || candidate.lng !== 0),
    );
    const city = group.confirmedCity?.trim() ?? withCoords[0]?.city?.trim() ?? '';
    const job = this.jobState.findJob(group.jobIds[0]);
    const groupState = job?.groupingKey
      ? this.orchestrator.getGroupState(group.batchId, job.groupingKey)
      : undefined;
    const street =
      groupState?.searchObject.street?.trim() ??
      group.titleAddress.split(',')[0]?.trim() ??
      group.titleAddress.trim();

    if (withCoords.length > 0) {
      const lat = withCoords.reduce((sum, candidate) => sum + candidate.lat, 0) / withCoords.length;
      const lng = withCoords.reduce((sum, candidate) => sum + candidate.lng, 0) / withCoords.length;
      return {
        id: 'street-centroid',
        addressLabel: [street, city].filter(Boolean).join(', '),
        lat,
        lng,
        city: city || null,
      };
    }

    const countryCode = groupState?.searchObject.country?.trim().toLowerCase() ?? 'at';
    if (!street || !city) {
      return null;
    }
    const hits = await this.geocoding.searchStructuredForward(
      { street, city, countryCode },
      { limit: 1, countrycodes: [countryCode] },
    );
    const hit = hits[0];
    if (!hit) {
      return null;
    }
    return {
      id: 'street-centroid',
      addressLabel: hit.displayName,
      lat: hit.lat,
      lng: hit.lng,
      city,
    };
  }

  async applyAreaConflictChoice(
    group: UploadDisambiguationGroup,
    candidateId: string,
    manualValue?: string,
  ): Promise<void> {
    const parsed = parseAdminLevelCandidateId(candidateId);
    const field = parsed?.field ?? (candidateId.split('|')[1] as AreaFieldKey | undefined);
    const value = parsed?.value ?? manualValue?.trim();
    if (!field || !value) {
      return;
    }

    const geo = await this.loadGeoData();
    const geoFull = { ...geo, postcodeMap: geo.postcodeMap };
    const oldKey = group.queryKey;
    const selections: Partial<Record<AreaFieldKey, string>> = { [field]: value };

    const resolvedJobs: Array<{
      jobId: string;
      groupingKey: string;
      searchObject: UploadGroupResolutionState['searchObject'];
      folderDisplayPath: string;
      titleAddressLabel: string;
    }> = [];

    for (const jobId of group.jobIds) {
      const job = this.jobState.findJob(jobId);
      if (!job) {
        continue;
      }
      const groupState = this.orchestrator.getGroupStateForJob(group.batchId, jobId);
      const baseSo = groupState?.searchObject;
      if (!baseSo) {
        continue;
      }
      const resolvedSo = applyAdminLevelSelectionsToSearchObject(baseSo, selections, geoFull);
      const { folderDisplayPath, titleAddressLabel } = {
        folderDisplayPath: job.folderDisplayPath ?? group.folderDisplayPath,
        titleAddressLabel: job.titleAddress ?? group.titleAddress,
      };
      this.jobState.updateJob(jobId, {
        groupingKey: resolvedSo.groupingKey,
        folderDisplayPath,
        titleAddress: titleAddressLabel,
      });
      resolvedJobs.push({
        jobId,
        groupingKey: resolvedSo.groupingKey,
        searchObject: resolvedSo,
        folderDisplayPath,
        titleAddressLabel,
      });
    }

    const stillConflicted = resolvedJobs.some(
      (row) => (row.searchObject.areaConflicts?.length ?? 0) > 0,
    );

    if (stillConflicted) {
      const sample = resolvedJobs[0];
      if (sample) {
        const nextConflicts = sample.searchObject.areaConflicts ?? [];
        const nextKey = buildAdminConflictQueryKey(buildAdminConflictSignature(nextConflicts));
        this.orchestrator.patchGroupState(group.batchId, {
          status: 'needsAreaResolution',
          groupingKey: nextKey,
          jobIds: [...group.jobIds],
          searchObject: sample.searchObject,
          folderDisplayPath: sample.folderDisplayPath,
          titleAddressLabel: sample.titleAddressLabel,
          areaConflictQueryKey: nextKey,
          areaConflicts: nextConflicts,
        });
        for (const row of resolvedJobs) {
          this.jobState.updateJob(row.jobId, { groupingKey: nextKey });
        }
        this.disambiguationStore.removeGroupById(group.id);
        this.registerAreaConflictGroup(group.batchId, {
          status: 'needsAreaResolution',
          groupingKey: nextKey,
          jobIds: [...group.jobIds],
          searchObject: sample.searchObject,
          folderDisplayPath: sample.folderDisplayPath,
          titleAddressLabel: sample.titleAddressLabel,
          areaConflictQueryKey: nextKey,
          areaConflicts: nextConflicts,
        });
      }
      this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
      return;
    }

    const byKey = new Map<
      string,
      {
        jobIds: string[];
        searchObject: UploadGroupResolutionState['searchObject'];
        folderDisplayPath: string;
        titleAddressLabel: string;
      }
    >();
    for (const row of resolvedJobs) {
      const existing = byKey.get(row.groupingKey);
      if (existing) {
        existing.jobIds.push(row.jobId);
      } else {
        byKey.set(row.groupingKey, {
          jobIds: [row.jobId],
          searchObject: row.searchObject,
          folderDisplayPath: row.folderDisplayPath,
          titleAddressLabel: row.titleAddressLabel,
        });
      }
    }

    await this.orchestrator.integrateResolvedAdminGroups(
      group.batchId,
      oldKey,
      [...byKey.entries()].map(([groupingKey, value]) => ({
        groupingKey,
        ...value,
      })),
    );

    this.disambiguationStore.patchGroup({
      ...group,
      resolutionStatus: 'resolved',
      resolutionGateOpen: false,
      selectedCandidateId: candidateId,
    });

    const resolvedEvent: DisambiguationResolvedEvent = {
      batchId: group.batchId,
      groupId: group.id,
      jobIds: [...group.jobIds],
      selectedCandidateId: candidateId,
    };
    this.resolution().notifyDisambiguationResolved(resolvedEvent);

    for (const jobId of group.jobIds) {
      this.jobState.setPhase(jobId, 'resolving_location');
      void this.resolution().applyPreResolveFromOrchestrator(jobId);
    }

    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }

  async applyLayerPackageChoice(
    group: UploadDisambiguationGroup,
    candidateId: string,
  ): Promise<void> {
    const prefix = 'layer-pkg|';
    const chosenLayerKey = candidateId.startsWith(prefix)
      ? candidateId.slice(prefix.length)
      : candidateId;
    const geo = await this.loadGeoData();
    const geoFull = { ...geo, postcodeMap: geo.postcodeMap };
    const oldKey = group.queryKey;

    const resolvedJobs = resolveLayerPackageJobs(
      group.jobIds,
      chosenLayerKey,
      geoFull,
      (jobId) => this.jobState.findJob(jobId),
      (jobId, patch) => this.jobState.updateJob(jobId, patch),
    );
    const byKey = bucketLayerPackageJobsByGroupingKey(resolvedJobs);

    await this.orchestrator.integrateResolvedLayerGroups(
      group.batchId,
      oldKey,
      [...byKey.entries()].map(([groupingKey, value]) => ({
        groupingKey,
        ...value,
      })),
    );

    this.disambiguationStore.patchGroup({
      ...group,
      resolutionStatus: 'resolved',
      resolutionGateOpen: false,
      selectedCandidateId: candidateId,
    });

    const resolvedEvent: DisambiguationResolvedEvent = {
      batchId: group.batchId,
      groupId: group.id,
      jobIds: [...group.jobIds],
      selectedCandidateId: candidateId,
    };
    this.resolution().notifyDisambiguationResolved(resolvedEvent);

    for (const jobId of group.jobIds) {
      this.jobState.setPhase(jobId, 'resolving_location');
      void this.resolution().applyPreResolveFromOrchestrator(jobId);
    }

    this.disambiguationStore.syncBatchDisambiguationAggregates(group.batchId);
    this.disambiguationStore.pickNextActiveGroup(group.batchId);
  }
}
