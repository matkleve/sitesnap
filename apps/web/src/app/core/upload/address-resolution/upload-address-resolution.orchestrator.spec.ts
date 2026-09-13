import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UploadAddressResolutionOrchestrator } from './upload-address-resolution.orchestrator';
import { UploadJobStateService } from '../support/upload-job-state.service';
import { UploadLocationLookupAdapter } from '../adapters/upload-location-lookup.adapter';
import { UploadProjectLocationsAdapter } from '../adapters/upload-project-locations.adapter';
import { LocalGeoDataAdapter } from '../../location-path-parser/local-geo-data.adapter';
import type { UploadJob } from '../upload-manager.types';

const geo = {
  states: [
    { n: 'Wien', a: ['vienna'] },
    { n: 'Tirol', a: [] },
  ],
  municipalities: [
    { n: 'Wien', b: 'Wien', a: ['vienna'] },
    { n: 'Innsbruck', b: 'Tirol', a: [] },
    { n: 'Graz', b: 'Steiermark', a: [] },
    { n: 'Salzburg', b: 'Salzburg', a: [] },
  ],
  postcodeMap: { '1090': ['Wien'], '1200': ['Wien'] },
};

function buildJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: overrides.id ?? 'job-1',
    batchId: 'batch-admin',
    file: new File([], 'photo.jpg', { type: 'image/jpeg' }),
    phase: 'resolving_location',
    progress: 0,
    statusLabel: 'Queued',
    submittedAt: new Date(),
    mode: 'new',
    relativePath: 'AT/Wien/Innsbruck/photo.jpg',
    ...overrides,
  };
}

describe('UploadAddressResolutionOrchestrator — admin level conflicts', () => {
  let orchestrator: UploadAddressResolutionOrchestrator;
  let jobState: UploadJobStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UploadAddressResolutionOrchestrator,
        UploadJobStateService,
        {
          provide: LocalGeoDataAdapter,
          useValue: {
            getBundeslaender: vi.fn().mockResolvedValue(geo.states),
            getGemeinden: vi.fn().mockResolvedValue(geo.municipalities),
            getPlzMap: vi.fn().mockResolvedValue(geo.postcodeMap),
          },
        },
        {
          provide: UploadLocationLookupAdapter,
          useValue: { findBySearchObject: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: UploadProjectLocationsAdapter,
          useValue: {
            listProjectLocations: vi.fn().mockResolvedValue([]),
            pickCentroid: vi.fn().mockReturnValue(null),
          },
        },
      ],
    });
    orchestrator = TestBed.inject(UploadAddressResolutionOrchestrator);
    jobState = TestBed.inject(UploadJobStateService);
    for (const job of [...jobState.jobs()]) {
      jobState.removeJob(job.id);
    }
    orchestrator.clearBatch('batch-admin');
    orchestrator.clearBatch('batch-plz');
    orchestrator.clearBatch('batch-split');
  });

  it('classifyBatch marks Wien/Innsbruck jobs as needsAdminLevelResolution', async () => {
    jobState.addJobs([buildJob()]);
    await orchestrator.classifyBatch('batch-admin');

    const states = orchestrator.listGroupStates('batch-admin');
    expect(states.some((s) => s.status === 'needsAdminLevelResolution')).toBe(true);
    const adminState = states.find((s) => s.status === 'needsAdminLevelResolution')!;
    expect(adminState.adminLevelConflicts?.length).toBeGreaterThan(0);
    expect(adminState.adminConflictQueryKey?.startsWith('adminConflict|')).toBe(true);
  });

  it('merges jobs with the same admin conflict signature', async () => {
    jobState.addJobs([
      buildJob({
        id: 'job-a',
        relativePath: 'AT/Wien/Innsbruck/photo.jpg',
        file: new File([], 'photo.jpg'),
      }),
      buildJob({
        id: 'job-b',
        relativePath: 'AT/Wien/Innsbruck/photo.jpg',
        file: new File([], 'photo.jpg'),
      }),
    ]);
    await orchestrator.classifyBatch('batch-admin');

    const adminStates = orchestrator
      .listGroupStates('batch-admin')
      .filter((s) => s.status === 'needsAdminLevelResolution');
    expect(adminStates).toHaveLength(1);
    expect(adminStates[0].jobIds).toEqual(expect.arrayContaining(['job-a', 'job-b']));
  });

  it('does not geocode-group Wien/1090 when postcode matches city', async () => {
    orchestrator.clearBatch('batch-plz');
    jobState.addJobs([
      buildJob({
        id: 'job-plz',
        batchId: 'batch-plz',
        relativePath: 'AT/Wien/1090/photo.jpg',
        file: new File([], 'photo.jpg'),
      }),
    ]);
    await orchestrator.classifyBatch('batch-plz');

    const states = orchestrator.listGroupStates('batch-plz');
    expect(states.some((s) => s.status === 'needsAdminLevelResolution')).toBe(false);
    expect(states.some((s) => s.status === 'needsGeocode' || s.status === 'partial')).toBe(true);
  });

  it('prioritizes admin conflict over layer_package when both would apply', async () => {
    jobState.addJobs([
      buildJob({
        id: 'job-mixed',
        relativePath: 'AT/Wien/Innsbruck/Kirchengasse 11/Schmiedgasse_5.jpg',
        file: new File([], 'Schmiedgasse_5.jpg'),
      }),
    ]);
    await orchestrator.classifyBatch('batch-admin');

    const states = orchestrator.listGroupStates('batch-admin');
    expect(states.some((s) => s.status === 'needsAdminLevelResolution')).toBe(true);
    expect(states.some((s) => s.status === 'needsLayerResolution')).toBe(false);
  });

  it('creates separate groups for different admin conflict signatures', async () => {
    orchestrator.clearBatch('batch-split');
    jobState.addJobs([
      buildJob({
        id: 'job-wien-innsbruck',
        batchId: 'batch-split',
        relativePath: 'AT/Wien/Innsbruck/photo.jpg',
        file: new File([], 'a.jpg'),
      }),
      buildJob({
        id: 'job-wien-salzburg',
        batchId: 'batch-split',
        relativePath: 'AT/Wien/Salzburg/photo.jpg',
        file: new File([], 'b.jpg'),
      }),
    ]);
    await orchestrator.classifyBatch('batch-split');

    const adminStates = orchestrator
      .listGroupStates('batch-split')
      .filter((s) => s.status === 'needsAdminLevelResolution');
    expect(adminStates).toHaveLength(2);
    expect(adminStates[0].adminConflictQueryKey).not.toBe(adminStates[1].adminConflictQueryKey);
  });

  it('integrateResolvedAdminGroups reclassifies into needsGeocode', async () => {
    // A real street in the path, because reaching `needsGeocode` needs a geocodable address and
    // `photo.jpg` is no longer read as a street name.
    // @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
    jobState.addJobs([
      buildJob({ relativePath: 'AT/Wien/Innsbruck/Maria-Theresien-Straße 18/photo.jpg' }),
    ]);
    await orchestrator.classifyBatch('batch-admin');

    const adminState = orchestrator
      .listGroupStates('batch-admin')
      .find((s) => s.status === 'needsAdminLevelResolution')!;
    const oldKey = adminState.adminConflictQueryKey ?? adminState.groupingKey;
    const resolvedSo = {
      ...adminState.searchObject,
      city: 'Wien',
      state: 'Wien',
      adminLevelConflicts: [],
      groupingKey: 'at|wien||wien||',
    };

    await orchestrator.integrateResolvedAdminGroups('batch-admin', oldKey, [
      {
        groupingKey: resolvedSo.groupingKey,
        jobIds: adminState.jobIds,
        searchObject: resolvedSo,
        folderDisplayPath: adminState.folderDisplayPath,
        titleAddressLabel: adminState.titleAddressLabel,
      },
    ]);

    const after = orchestrator.listGroupStates('batch-admin');
    expect(after.some((s) => s.status === 'needsAdminLevelResolution')).toBe(false);
    expect(after.some((s) => s.status === 'needsGeocode' || s.status === 'partial')).toBe(true);
    const geocodeState = after.find((s) => s.status === 'needsGeocode');
    expect(geocodeState?.resolvedFromAdminConflict).toBe(true);
  });

  it('integrateResolvedAdminGroups sets resolvedFromAdminConflict on branch_c groups', async () => {
    jobState.addJobs([buildJob()]);
    await orchestrator.classifyBatch('batch-admin');

    const adminState = orchestrator
      .listGroupStates('batch-admin')
      .find((s) => s.status === 'needsAdminLevelResolution')!;
    const oldKey = adminState.adminConflictQueryKey ?? adminState.groupingKey;
    const resolvedSo = {
      ...adminState.searchObject,
      city: 'Wien',
      state: 'Wien',
      street: null,
      houseNumber: null,
      adminLevelConflicts: [],
      groupingKey: 'at|wien||wien||',
    };

    await orchestrator.integrateResolvedAdminGroups('batch-admin', oldKey, [
      {
        groupingKey: resolvedSo.groupingKey,
        jobIds: adminState.jobIds,
        searchObject: resolvedSo,
        folderDisplayPath: adminState.folderDisplayPath,
        titleAddressLabel: adminState.titleAddressLabel,
      },
    ]);

    const after = orchestrator.listGroupStates('batch-admin');
    const geocodeState = after.find(
      (s) => s.status === 'needsGeocode' && s.resolvedFromAdminConflict,
    );
    if (geocodeState) {
      expect(geocodeState.resolvedFromAdminConflict).toBe(true);
    }
  });

  it('non-admin-resolved groups do NOT have resolvedFromAdminConflict', async () => {
    orchestrator.clearBatch('batch-plz');
    jobState.addJobs([
      buildJob({
        id: 'job-regular',
        batchId: 'batch-plz',
        relativePath: 'AT/Wien/1090/Hauptstraße/photo.jpg',
        file: new File([], 'photo.jpg'),
      }),
    ]);
    await orchestrator.classifyBatch('batch-plz');

    const states = orchestrator.listGroupStates('batch-plz');
    const geocodeState = states.find((s) => s.status === 'needsGeocode');
    if (geocodeState) {
      expect(geocodeState.resolvedFromAdminConflict).toBeUndefined();
    }
  });

  it('admin conflict query key uses signature with sorted values', async () => {
    jobState.addJobs([buildJob()]);
    await orchestrator.classifyBatch('batch-admin');

    const adminState = orchestrator
      .listGroupStates('batch-admin')
      .find((s) => s.status === 'needsAdminLevelResolution')!;
    const key = adminState.adminConflictQueryKey!;
    expect(key).toMatch(/^adminConflict\|city\|/);
    const valuePart = key.replace('adminConflict|city|', '');
    const values = valuePart.split(',');
    const sorted = [...values].sort();
    expect(values).toEqual(sorted);
  });
});
