/**
 * A resolved group applies one geocode to every job in it. One job being held for a source-conflict
 * tray is that job's business — it must not decide the outcome of the job asking, and it must not
 * stop the candidate reaching the rest of the group.
 *
 * @see docs/study/005-upload-pipeline-trace-findings.md#f-16
 */
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { UploadAddressResolutionOrchestrator } from '../address-resolution/upload-address-resolution.orchestrator';
import { UploadJobStateService } from '../support/upload-job-state.service';
import { UploadLocationGeocodeGroupService } from './upload-location-geocode-group.service';
import { UploadLocationPlacementService } from './upload-location-placement.service';
import { UploadLocationPreResolveOrchestratorService } from './upload-location-pre-resolve-orchestrator.service';
import { UploadLocationResolutionService } from './upload-location-resolution.service';
import { UploadLocationTrayFlowService } from './upload-location-tray-flow.service';
import type { UploadGroupResolutionState } from '../address-resolution/upload-address-resolution.types';
import type { UploadJob } from '../upload-manager.types';

const GROUPING_KEY = 'at|wien|1010|wien|karntner straße|4';

function job(id: string): UploadJob {
  return {
    id,
    batchId: 'batch-1',
    file: new File(['bytes'], `${id}.jpg`, { type: 'image/jpeg' }),
    phase: 'dedup_check',
    progress: 0,
    statusLabel: 'Checking for duplicates…',
    submittedAt: new Date(),
    mode: 'new',
    groupingKey: GROUPING_KEY,
    titleAddress: 'Kärntner Straße 4',
    titleAddressSource: 'folder',
    relativePath: `AT/Wien/1010/Kärntner Straße 4/${id}.jpg`,
  };
}

const groupState = {
  status: 'resolved',
  groupingKey: GROUPING_KEY,
  jobIds: ['job-with-exif', 'job-without-exif'],
  folderDisplayPath: 'AT/Wien/1010/Kärntner Straße 4',
  candidate: { id: 'candidate-1', addressLabel: 'Kärntner Straße 4, 1010 Wien' },
  // The debug summary reads the Search Object, so the fixture needs one.
  searchObject: {
    country: 'AT',
    city: 'Wien',
    postcode: '1010',
    street: 'Kärntner Straße',
    houseNumber: '4',
    groupingKey: GROUPING_KEY,
    sources: [],
    sourceDeviations: [],
    postcodeCandidates: [],
    uncertainFields: [],
  },
} as unknown as UploadGroupResolutionState;

function setup(): {
  service: UploadLocationPreResolveOrchestratorService;
  applyCandidate: ReturnType<typeof vi.fn>;
} {
  const applyCandidate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      UploadJobStateService,
      UploadLocationPreResolveOrchestratorService,
      {
        provide: UploadAddressResolutionOrchestrator,
        useValue: { getGroupState: vi.fn().mockReturnValue(groupState) },
      },
      {
        provide: UploadLocationPlacementService,
        useValue: {
          applyGeocodeCandidateToJob: applyCandidate,
          // Only the job carrying both pins is held by the source-conflict tray.
          finalizePlacementForJob: vi.fn((id: string) => id === 'job-with-exif'),
        },
      },
      {
        provide: UploadLocationGeocodeGroupService,
        useValue: { ensureGeocodedGroup: vi.fn() },
      },
      { provide: UploadLocationTrayFlowService, useValue: {} },
      { provide: UploadLocationResolutionService, useValue: { registerDisambiguationGroup: vi.fn() } },
    ],
  });
  TestBed.inject(UploadJobStateService).addJobs([job('job-with-exif'), job('job-without-exif')]);
  return { service: TestBed.inject(UploadLocationPreResolveOrchestratorService), applyCandidate };
}

describe('applyPreResolveFromOrchestrator — resolved group with one held sibling', () => {
  it('reports continue for a job that is not itself held', async () => {
    const { service } = setup();

    await expect(service.applyPreResolveFromOrchestrator('job-without-exif')).resolves.toBe(
      'continue',
    );
  });

  it('reports held for the job that is held', async () => {
    const { service } = setup();

    await expect(service.applyPreResolveFromOrchestrator('job-with-exif')).resolves.toBe('held');
  });

  it('applies the group candidate to every job, not only up to the held one', async () => {
    const { service, applyCandidate } = setup();

    await service.applyPreResolveFromOrchestrator('job-without-exif');

    expect(applyCandidate.mock.calls.map((call) => call[0])).toEqual([
      'job-with-exif',
      'job-without-exif',
    ]);
  });
});
