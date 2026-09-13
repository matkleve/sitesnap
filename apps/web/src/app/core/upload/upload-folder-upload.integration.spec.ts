/**
 * Folder upload integration test — exercises the full pipeline for a batch of
 * photos: Search Object (SO) creation → dedup (content-hash) → DB lookup
 * (findBySearchObject) → tray / disambiguation registration.
 *
 * Uses the REAL AT geo data (assets/geo/*.json) so SO branch classification
 * (branch_a / branch_c / packageConflict) reflects production behavior.
 */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInflightDedupRegistryForTests } from './support/upload-inflight-dedup.registry';
import { clearHeicConversionRegistryForTests } from './support/upload-heic-prepare.util';
import * as fs from 'fs';
import * as path from 'path';
import { UploadManagerService } from './upload-manager.service';
import { UploadService } from './upload.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { LocalGeoDataAdapter } from '../location-path-parser/local-geo-data.adapter';
import type { BundeslandRecord, GemeindeRecord, PlzMap } from '../location-path-parser/local-geo-data.adapter';
import { UploadAddressResolutionOrchestrator } from './address-resolution/upload-address-resolution.orchestrator';
import { UploadLocationResolutionService } from './location/upload-location-resolution.service';
import {
  adminLevelManualCandidateId,
} from './location/upload-location-area-choice.util';
import { UploadLocationPreResolveOrchestratorService } from './location/upload-location-pre-resolve-orchestrator.service';
import { UploadLocationTrayFlowService } from './location/upload-location-tray-flow.service';
import type { ScannedFileEntry } from '../folder-scan/folder-scan.service';
import { signal } from '@angular/core';

// ── Real AT geo data ─────────────────────────────────────────────────────

const ASSETS_DIR = path.join(__dirname, '../../../assets/geo');

function loadRealGeo(): { states: BundeslandRecord[]; municipalities: GemeindeRecord[]; postcodeMap: PlzMap } {
  const states = JSON.parse(
    fs.readFileSync(path.join(ASSETS_DIR, 'at-bundeslaender.json'), 'utf-8'),
  ) as BundeslandRecord[];
  const municipalities = JSON.parse(
    fs.readFileSync(path.join(ASSETS_DIR, 'at-gemeinden-bev.json'), 'utf-8'),
  ) as GemeindeRecord[];
  const postcodeMap = JSON.parse(
    fs.readFileSync(path.join(ASSETS_DIR, 'at-plz.json'), 'utf-8'),
  ) as PlzMap;
  return { states, municipalities, postcodeMap };
}

// ── Fakes ─────────────────────────────────────────────────────────────────

function buildFakeUploadService() {
  return {
    resolveMimeType: vi.fn().mockReturnValue('image/jpeg'),
    resolveMediaType: vi.fn().mockReturnValue('photo'),
    isPhotoFile: vi.fn().mockReturnValue(true),
    validateFile: vi.fn().mockReturnValue({ valid: true }),
    // No EXIF GPS — avoids text/EXIF source-conflict trays in these scenarios.
    parseExif: vi.fn().mockResolvedValue({}),
    isHeic: vi.fn().mockReturnValue(false),
    convertToJpeg: vi.fn().mockImplementation(async (file: File) => file),
    // Echo back manualCoords like the real persistUploadFile (finalCoords = manualCoords).
    uploadFile: vi.fn().mockImplementation(async (_file: File, manualCoords?: { lat: number; lng: number }) => ({
      id: 'img-123',
      storagePath: 'org/user/uuid.jpg',
      coords: manualCoords,
      direction: undefined,
      error: null,
    })),
  };
}

function buildFakeGeocodingService() {
  return {
    reverse: vi.fn().mockResolvedValue({
      addressLabel: 'Test',
      city: 'Test',
      district: null,
      street: 'Test',
      country: 'Austria',
    }),
    forward: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    searchStructuredForward: vi.fn().mockResolvedValue([]),
    searchStructuredForwardBias: vi.fn().mockResolvedValue([]),
    searchStreetHouseNumbers: vi.fn().mockResolvedValue([]),
  };
}

function buildFakeAuthService() {
  const userSignal = signal({ id: 'user-1' });
  return {
    user: userSignal.asReadonly(),
    session: signal(null).asReadonly(),
    loading: signal(false).asReadonly(),
    _userSignal: userSignal,
  };
}

type RpcHandler = (params: Record<string, unknown>) => { data: unknown; error: unknown };

function buildFakeSupabaseService(rpcHandlers: Record<string, RpcHandler> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildQueryChain(resolvedValue: { data: unknown; error: unknown } = { data: null, error: null }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.upsert = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue(resolvedValue);
    chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(onFulfilled, onRejected);
    return chain;
  }

  return {
    client: {
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          upload: vi.fn().mockResolvedValue({ data: { path: 'test.jpg' }, error: null }),
        }),
      },
      from: vi.fn().mockImplementation(() => buildQueryChain()),
      rpc: vi.fn().mockImplementation(async (name: string, params: Record<string, unknown>) => {
        const handler = rpcHandlers[name];
        if (handler) {
          return handler(params);
        }
        return { data: null, error: null };
      }),
    },
  };
}

function makeFile(name: string, content: Uint8Array<ArrayBuffer> = new Uint8Array(512)): File {
  return new File([content], name, { type: 'image/jpeg' });
}

// ── Setup ─────────────────────────────────────────────────────────────────

async function setup(rpcHandlers: Record<string, RpcHandler> = {}) {
  const fakeUpload = buildFakeUploadService();
  const fakeGeocoding = buildFakeGeocodingService();
  const fakeAuth = buildFakeAuthService();
  const fakeSupabase = buildFakeSupabaseService(rpcHandlers);
  const geo = loadRealGeo();

  TestBed.configureTestingModule({
    providers: [
      UploadManagerService,
      { provide: UploadService, useValue: fakeUpload },
      { provide: GeocodingService, useValue: fakeGeocoding },
      { provide: AuthService, useValue: fakeAuth },
      { provide: SupabaseService, useValue: fakeSupabase },
      {
        provide: LocalGeoDataAdapter,
        useValue: {
          getBundeslaender: vi.fn().mockResolvedValue(geo.states),
          getGemeinden: vi.fn().mockResolvedValue(geo.municipalities),
          getPlzMap: vi.fn().mockResolvedValue(geo.postcodeMap),
        },
      },
    ],
  });

  const service = TestBed.inject(UploadManagerService);
  const locationResolution = TestBed.inject(UploadLocationResolutionService);
  const orchestrator = TestBed.inject(UploadAddressResolutionOrchestrator);
  const trayFlow = TestBed.inject(UploadLocationTrayFlowService);
  return {
    service,
    fakeUpload,
    fakeGeocoding,
    fakeAuth,
    fakeSupabase,
    locationResolution,
    orchestrator,
    trayFlow,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('UploadManagerService — folder upload integration (SO → dedup → DB lookup → tray)', () => {
  beforeEach(() => {
    clearInflightDedupRegistryForTests();
    clearHeicConversionRegistryForTests();
  });
  it('(a) multiple photos, same address, single Photon hit → auto-resolve & upload all', async () => {
    const { service, fakeGeocoding } = await setup();

    fakeGeocoding.searchStructuredForward.mockResolvedValue([
      {
        lat: 47.0707,
        lng: 15.4395,
        displayName: 'Annenstraße 10, Graz, Österreich',
        name: 'Annenstraße 10',
        importance: 0.97,
        address: {
          road: 'Annenstraße',
          house_number: '10',
          postcode: '8020',
          city: 'Graz',
          country: 'Österreich',
          country_code: 'at',
        },
      },
    ]);

    const events: { jobId: string; mediaId: string }[] = [];
    service.imageUploaded$.subscribe((e) => events.push(e));

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('IMG_1.jpg'),
        relativePath: 'AT/Graz/Annenstraße 10/IMG_1.jpg',
        directorySegments: ['AT', 'Graz', 'Annenstraße 10'],
      },
      {
        file: makeFile('IMG_2.jpg'),
        relativePath: 'AT/Graz/Annenstraße 10/IMG_2.jpg',
        directorySegments: ['AT', 'Graz', 'Annenstraße 10'],
      },
      {
        file: makeFile('IMG_3.jpg'),
        relativePath: 'AT/Graz/Annenstraße 10/IMG_3.jpg',
        directorySegments: ['AT', 'Graz', 'Annenstraße 10'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Annenstraße 10');

    await vi.waitFor(() => {
      expect(events.length).toBe(3);
    });

    // Single group → geocode runs once for all three jobs.
    expect(fakeGeocoding.searchStructuredForward).toHaveBeenCalledTimes(1);

    const jobs = service.jobs();
    expect(jobs.every((j) => j.phase === 'complete')).toBe(true);
    expect(jobs.every((j) => !!j.coords)).toBe(true);
  });

  it('(b) duplicate file content (locationRequirementMode: optional) → dedup skip', async () => {
    let dedupCalls = 0;
    const { service } = await setup({
      check_dedup_hashes: () => {
        dedupCalls += 1;
        if (dedupCalls === 1) {
          return { data: [], error: null };
        }
        return {
          data: [{ media_item_id: 'img-123', registered_by_user_id: 'user-1' }],
          error: null,
        };
      },
    });

    const skipped: { jobId: string; existingMediaId: string }[] = [];
    service.uploadSkipped$.subscribe((e) => skipped.push(e));
    const uploaded: { jobId: string }[] = [];
    service.imageUploaded$.subscribe((e) => uploaded.push(e));

    const sameContent = new Uint8Array(512).fill(42);
    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('IMG_1.jpg', sameContent),
        relativePath: 'Duplikate/IMG_1.jpg',
        directorySegments: ['Duplikate'],
      },
      {
        file: makeFile('IMG_2.jpg', sameContent),
        relativePath: 'Duplikate/IMG_2.jpg',
        directorySegments: ['Duplikate'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Duplikate', { locationRequirementMode: 'optional' });

    await vi.waitFor(() => {
      expect(skipped.length).toBe(1);
    });

    expect(skipped[0].existingMediaId).toBe('img-123');

    // The non-duplicate job continues through the normal upload path.
    await vi.waitFor(() => {
      expect(uploaded.length).toBe(1);
    });
  });

  it('(c) ambiguous Photon hits for street-only address → city_step disambiguation tray (1a)', async () => {
    const { service, fakeGeocoding, locationResolution } = await setup();

    fakeGeocoding.searchStructuredForward.mockResolvedValue([
      {
        lat: 48.3059,
        lng: 14.2862,
        displayName: 'Hauptstraße 5, Linz, Österreich',
        name: 'Hauptstraße 5',
        importance: 0.75,
        address: {
          road: 'Hauptstraße',
          house_number: '5',
          postcode: '4020',
          city: 'Linz',
          country: 'Österreich',
          country_code: 'at',
        },
      },
      {
        lat: 47.7981,
        lng: 13.0457,
        displayName: 'Hauptstraße 5, Salzburg, Österreich',
        name: 'Hauptstraße 5',
        importance: 0.7,
        address: {
          road: 'Hauptstraße',
          house_number: '5',
          postcode: '5020',
          city: 'Salzburg',
          country: 'Österreich',
          country_code: 'at',
        },
      },
    ]);

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('IMG_1.jpg'),
        relativePath: 'Hauptstraße 5/IMG_1.jpg',
        directorySegments: ['Hauptstraße 5'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Hauptstraße 5');

    await vi.waitFor(() => {
      const groups = locationResolution
        .disambiguationGroups()
        .filter((g) => g.disambiguationKind === 'city_step');
      expect(groups.length).toBe(1);
    });

    const group = locationResolution
      .disambiguationGroups()
      .find((g) => g.disambiguationKind === 'city_step')!;
    expect(group.trayStep).toBe('1a');
    expect(group.candidates.length).toBe(2);
  });

  it('(d1) admin level conflict (Wien/Innsbruck) → admin_level_conflict tray before geocode', async () => {
    const { service, fakeGeocoding, locationResolution } = await setup();

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('photo.jpg'),
        relativePath: 'AT/Wien/Innsbruck/photo.jpg',
        directorySegments: ['AT', 'Wien', 'Innsbruck'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Innsbruck');

    await vi.waitFor(() => {
      const groups = locationResolution
        .disambiguationGroups()
        .filter((g) => g.disambiguationKind === 'admin_level_conflict');
      expect(groups.length).toBe(1);
    });

    expect(fakeGeocoding.searchStructuredForward).not.toHaveBeenCalled();
    expect(fakeGeocoding.searchStructuredForwardBias).not.toHaveBeenCalled();

    const group = locationResolution
      .disambiguationGroups()
      .find((g) => g.disambiguationKind === 'admin_level_conflict')!;
    expect(group.areaConflicts?.length).toBeGreaterThan(0);
    expect(group.candidates.length).toBeGreaterThanOrEqual(2);
    expect(group.candidates.some((c) => c.addressLabel.toLowerCase().includes('innsbruck'))).toBe(
      true,
    );
  });

  it(
    '(d3) resolving admin_level_conflict choice clears gate and continues pre-resolve',
    async () => {
    const { service, fakeGeocoding, locationResolution, orchestrator, trayFlow } =
      await setup();
    const preResolve = TestBed.inject(UploadLocationPreResolveOrchestratorService);

    fakeGeocoding.searchStructuredForward.mockResolvedValue([
      {
        lat: 47.2692,
        lng: 11.4041,
        displayName: 'Hauptstraße 5, Wien, Österreich',
        name: 'Hauptstraße 5',
        importance: 0.9,
        address: {
          road: 'Hauptstraße',
          house_number: '5',
          postcode: '1010',
          city: 'Wien',
          country: 'Österreich',
          country_code: 'at',
        },
      },
    ]);

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('photo.jpg'),
        relativePath: 'AT/Wien/Innsbruck/Hauptstraße 5/photo.jpg',
        directorySegments: ['AT', 'Wien', 'Innsbruck', 'Hauptstraße 5'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Hauptstraße 5');

    await vi.waitFor(() => {
      const groups = locationResolution
        .disambiguationGroups()
        .filter((g) => g.disambiguationKind === 'admin_level_conflict');
      expect(groups.length).toBe(1);
    });

    expect(fakeGeocoding.searchStructuredForward).not.toHaveBeenCalled();
    expect(fakeGeocoding.searchStructuredForwardBias).not.toHaveBeenCalled();

    const group = locationResolution
      .disambiguationGroups()
      .find((g) => g.disambiguationKind === 'admin_level_conflict')!;
    await trayFlow.applyAreaConflictChoice(
      group,
      adminLevelManualCandidateId('city'),
      'Wien',
    );

    const batchId = service.jobs()[0]!.batchId;
    await vi.waitFor(
      () => {
        const states = orchestrator.listGroupStates(batchId);
        expect(states.some((s) => s.status === 'needsAreaResolution')).toBe(false);
        const job = service.jobs()[0];
        expect(job?.phase).not.toBe('awaiting_disambiguation');
      },
      { timeout: 5000 },
    );

    const openAdminGroups = locationResolution
      .disambiguationGroups()
      .filter((g) => g.disambiguationKind === 'admin_level_conflict' && g.resolutionGateOpen);
    expect(openAdminGroups).toHaveLength(0);

    const preResolveResult = await preResolve.applyPreResolveFromOrchestrator(
      service.jobs()[0]!.id,
    );
    expect(preResolveResult).not.toBe('held');

    const states = orchestrator.listGroupStates(batchId);
    expect(states.some((s) => s.status === 'needsAreaResolution')).toBe(false);
    expect(
      states.some((s) =>
        ['needsGeocode', 'needsTray', 'resolved', 'partial'].includes(s.status),
      ),
    ).toBe(true);
    },
    15_000,
  );

  it('(d2) two files with same admin conflict merge into one tray group', async () => {
    const { service, locationResolution } = await setup();

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('a.jpg'),
        relativePath: 'AT/Wien/Innsbruck/a.jpg',
        directorySegments: ['AT', 'Wien', 'Innsbruck'],
      },
      {
        file: makeFile('b.jpg'),
        relativePath: 'AT/Wien/Innsbruck/b.jpg',
        directorySegments: ['AT', 'Wien', 'Innsbruck'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Innsbruck');

    await vi.waitFor(() => {
      const groups = locationResolution
        .disambiguationGroups()
        .filter((g) => g.disambiguationKind === 'admin_level_conflict');
      const coveredJobs = groups.reduce((sum, g) => sum + g.jobIds.length, 0);
      expect(coveredJobs).toBe(2);
    });

    const groups = locationResolution
      .disambiguationGroups()
      .filter((g) => g.disambiguationKind === 'admin_level_conflict');
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups.every((g) => g.candidates.length >= 2)).toBe(true);
  });

  it('(d) folder/filename layer-package conflict → layer_package tray before geocode', async () => {
    const { service, fakeGeocoding, locationResolution } = await setup();

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('Schmiedgasse_5.jpg'),
        relativePath: 'AT/Graz/Kirchengasse 11/Schmiedgasse_5.jpg',
        directorySegments: ['AT', 'Graz', 'Kirchengasse 11'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Kirchengasse 11');

    await vi.waitFor(() => {
      const groups = locationResolution
        .disambiguationGroups()
        .filter((g) => g.disambiguationKind === 'layer_package');
      expect(groups.length).toBe(1);
    });

    // Conflict must be resolved BEFORE any geocode call.
    expect(fakeGeocoding.searchStructuredForward).not.toHaveBeenCalled();
    expect(fakeGeocoding.searchStructuredForwardBias).not.toHaveBeenCalled();

    const group = locationResolution
      .disambiguationGroups()
      .find((g) => g.disambiguationKind === 'layer_package')!;
    expect(group.candidates.length).toBeGreaterThanOrEqual(2);
    const labels = group.candidates.map((c) => c.addressLabel);
    expect(labels.some((l) => l.includes('Kirchengasse'))).toBe(true);
    expect(labels.some((l) => l.includes('Schmiedgasse'))).toBe(true);
  });

  it('(e) DB-pre-resolved address → no Photon call, job completes from DB hit', async () => {
    const { service, fakeGeocoding } = await setup({
      get_location_by_address_components: () => ({
        data: {
          id: 'loc-1',
          latitude: 48.3059,
          longitude: 14.2862,
          street: 'Hauptplatz',
          house_number: '1',
          postcode: '4020',
          city: 'Linz',
          district: null,
          country: 'AT',
          address_label: 'Hauptplatz 1, Linz',
        },
        error: null,
      }),
    });

    const events: { jobId: string; mediaId: string }[] = [];
    service.imageUploaded$.subscribe((e) => events.push(e));

    const entries: ScannedFileEntry[] = [
      {
        file: makeFile('IMG_1.jpg'),
        relativePath: 'AT/Linz/Hauptplatz 1/IMG_1.jpg',
        directorySegments: ['AT', 'Linz', 'Hauptplatz 1'],
      },
    ];

    await service.submitWebkitFolder(entries, 'Hauptplatz 1');

    await vi.waitFor(() => {
      expect(events.length).toBe(1);
    });

    expect(fakeGeocoding.searchStructuredForward).not.toHaveBeenCalled();
    expect(fakeGeocoding.searchStructuredForwardBias).not.toHaveBeenCalled();

    const job = service.jobs()[0];
    expect(job.phase).toBe('complete');
    expect(job.coords).toEqual({ lat: 48.3059, lng: 14.2862 });
  });
});
