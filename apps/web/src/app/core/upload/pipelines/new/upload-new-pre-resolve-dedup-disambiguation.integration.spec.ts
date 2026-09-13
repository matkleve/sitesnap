/**
 * NF-38 — post-dedup phase transitions must allow location resolution and tray gates.
 * Uses real UploadJobStateService (no setPhase mock) so illegal FSM edges fail loudly.
 *
 * @see docs/audits/upload-flow-review-2026-09-10/02-new-issues.md § NF-38
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeocodingService } from '../../../geocoding/geocoding.service';
import { FilenameParserService } from '../../../filename-parser/filename-parser.service';
import { UploadResolverTrayOrchestratorService } from '../../../upload-resolver-tray-orchestrator/upload-resolver-tray-orchestrator.service';
import { UploadAddressResolutionOrchestrator } from '../../address-resolution/upload-address-resolution.orchestrator';
import { areAllJobsReadyForTrayResolution } from '../../address-resolution/upload-tray-resolution-gate.helpers';
import { UploadBatchService } from '../../support/upload-batch.service';
import { UploadJobStateService } from '../../support/upload-job-state.service';
import { UploadLocationConfigService } from '../../location/upload-location-config.service';
import { UploadLocationResolutionService } from '../../location/upload-location-resolution.service';
import { UploadManagerService } from '../../upload-manager.service';
import { UploadProjectLocationsAdapter } from '../../adapters/upload-project-locations.adapter';
import { LocalGeoDataAdapter } from '../../../location-path-parser/local-geo-data.adapter';
import { OrgSearchTuningService } from '../../../search/org-search-tuning.service';
import { runPreUploadLocationResolve } from './upload-new-pre-resolve.util';
import type { PipelineContext, UploadJob } from '../../upload-manager.types';
import type { ParsedExif } from '../../upload.service';

function createJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: 'job-ambiguous',
    batchId: 'batch-1',
    file: new File(['photo-bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    phase: 'parsing_exif',
    progress: 0,
    statusLabel: 'Reading EXIF…',
    submittedAt: new Date(),
    mode: 'new',
    filePrepareComplete: true,
    titleAddress: 'Thaliastraße, Wien',
    titleAddressSource: 'folder',
    relativePath: 'Wien/photo.jpg',
    parsedExif: { coords: { lat: 48.21, lng: 16.37 } },
    ...overrides,
  };
}

function buildPipelineContext(): PipelineContext {
  return {
    emitBatchProgress: vi.fn(),
    drainQueue: vi.fn(),
    emitMissingData: vi.fn(),
    failJob: vi.fn(),
    emitUploadSkipped: vi.fn(),
    emitImageUploaded: vi.fn(),
    emitImageReplaced: vi.fn(),
    emitImageAttached: vi.fn(),
    emitLocationConflict: vi.fn(),
    emitDuplicateDetected: vi.fn(),
    getAbortSignal: vi.fn(),
    abortJobRequest: vi.fn(),
    checkDedupHash: vi.fn().mockResolvedValue(null),
    getCurrentUserId: vi.fn().mockReturnValue('user-1'),
  };
}

describe('runPreUploadLocationResolve — post-dedup ambiguous geocode (real job state)', () => {
  let jobState: UploadJobStateService;
  let locationResolution: UploadLocationResolutionService;
  let geocodingSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    geocodingSearch = vi.fn().mockResolvedValue([
      {
        lat: 48.2,
        lng: 16.37,
        displayName: 'Thaliastraße A, Wien',
        name: 'Thaliastraße A',
        importance: 0.75,
        address: { city: 'Wien', road: 'Thaliastraße' },
      },
      {
        lat: 48.3,
        lng: 16.38,
        displayName: 'Thaliastraße B, Graz',
        name: 'Thaliastraße B',
        importance: 0.72,
        address: { city: 'Graz', road: 'Thaliastraße' },
      },
    ]);

    TestBed.configureTestingModule({
      providers: [
        UploadJobStateService,
        UploadLocationResolutionService,
        UploadLocationConfigService,
        UploadAddressResolutionOrchestrator,
        UploadBatchService,
        UploadResolverTrayOrchestratorService,
        {
          provide: GeocodingService,
          useValue: {
            search: geocodingSearch,
            reverse: vi.fn(),
            forward: vi.fn(),
          },
        },
        {
          provide: FilenameParserService,
          useValue: { extractAddress: vi.fn().mockReturnValue(undefined) },
        },
        {
          provide: UploadProjectLocationsAdapter,
          useValue: { listForProject: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: LocalGeoDataAdapter,
          useValue: {
            getBundeslaender: vi.fn().mockResolvedValue([]),
            getGemeinden: vi.fn().mockResolvedValue([]),
            getPlzMap: vi.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: OrgSearchTuningService,
          useValue: { getTuning: vi.fn().mockReturnValue({}) },
        },
        {
          provide: UploadManagerService,
          useValue: { kickQueueAfterLocationGate: vi.fn() },
        },
      ],
    });

    jobState = TestBed.inject(UploadJobStateService);
    locationResolution = TestBed.inject(UploadLocationResolutionService);
    TestBed.inject(UploadResolverTrayOrchestratorService).resetAll();
    locationResolution.clearBatch('batch-1');
  });

  it('reaches awaiting_disambiguation after dedup_check and opens the tray Continue gate', async () => {
    const job = createJob();
    jobState.addJobs([job]);
    const ctx = buildPipelineContext();
    const parsedExif = job.parsedExif as ParsedExif;

    const outcome = await runPreUploadLocationResolve(
      {
        jobState,
        queue: { markDone: vi.fn() },
        uploadService: {
          resolveMediaType: vi.fn().mockReturnValue('photo'),
        },
        filenameParser: TestBed.inject(FilenameParserService),
        locationConfig: TestBed.inject(UploadLocationConfigService),
        locationResolution,
        addressOrchestrator: TestBed.inject(UploadAddressResolutionOrchestrator),
      },
      job.id,
      parsedExif,
      ctx,
    );

    expect(outcome).toBe('held');
    const updated = jobState.findJob(job.id)!;
    expect(updated.phase).toBe('awaiting_disambiguation');
    expect(updated.disambiguationGroupId).toBeTruthy();
    expect(geocodingSearch).toHaveBeenCalled();

    expect(
      areAllJobsReadyForTrayResolution([job.id], (id) => jobState.findJob(id)),
    ).toBe(true);
  });

  // F-14: the async source-conflict registration parks the job while it is still hashing, so the
  // dedup step's own `setPhase('dedup_check')` overwrites the gate. The hold is the job's
  // disambiguation group, not the phase label — a job holding one must never leave pre-resolve
  // running, whatever its phase says when the label is read.
  // @see docs/study/005-upload-pipeline-trace-findings.md#f-14
  it('keeps a job parked when it was registered for a tray before dedup ran', async () => {
    geocodingSearch.mockResolvedValue([
      {
        lat: 48.2,
        lng: 16.37,
        displayName: 'Thaliastraße A, Wien',
        name: 'Thaliastraße A',
        importance: 0.9,
        address: { city: 'Wien', road: 'Thaliastraße' },
      },
    ]);
    const job = createJob({
      phase: 'awaiting_disambiguation',
      disambiguationGroupId: 'group-registered-during-hashing',
      resolutionStatus: 'pending',
    });
    jobState.addJobs([job]);

    const outcome = await runPreUploadLocationResolve(
      {
        jobState,
        queue: { markDone: vi.fn() },
        uploadService: { resolveMediaType: vi.fn().mockReturnValue('photo') },
        filenameParser: TestBed.inject(FilenameParserService),
        locationConfig: TestBed.inject(UploadLocationConfigService),
        locationResolution,
        addressOrchestrator: TestBed.inject(UploadAddressResolutionOrchestrator),
      },
      job.id,
      job.parsedExif as ParsedExif,
      buildPipelineContext(),
    );

    expect(outcome).toBe('held');
    const updated = jobState.findJob(job.id)!;
    expect(updated.disambiguationGroupId).toBe('group-registered-during-hashing');
    expect(updated.phase).toBe('awaiting_disambiguation');
  });
});
