/**
 * WorkspaceViewService — address resolution tests.
 *
 * Strategy:
 *  - SupabaseService, GeocodingService, and FilterService are faked.
 *  - Tests verify the resolveUnresolvedAddresses flow: filtering, dedup,
 *    DB update, and local signal patching.
 *  - No real HTTP or DB calls.
 */

import { TestBed } from '@angular/core/testing';
import { WorkspaceViewService } from './workspace-view.service';
import { SupabaseService } from './supabase.service';
import { FilterService } from './filter.service';
import { GeocodingService } from './geocoding.service';
import { PropertyRegistryService } from './property-registry.service';
import type { WorkspaceImage } from './workspace-view.types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeImage(overrides: Partial<WorkspaceImage> = {}): WorkspaceImage {
  return {
    id: crypto.randomUUID(),
    latitude: 47.3769,
    longitude: 8.5417,
    thumbnailPath: null,
    storagePath: 'org/user/photo.jpg',
    capturedAt: '2025-06-01T12:00:00Z',
    createdAt: '2025-06-01T12:00:00Z',
    projectId: null,
    projectName: null,
    direction: null,
    exifLatitude: 47.3769,
    exifLongitude: 8.5417,
    addressLabel: null,
    city: null,
    district: null,
    street: null,
    country: null,
    userName: null,
    ...overrides,
  };
}

const ZURICH_RESULT = {
  addressLabel: 'Burgstraße 7, 8001 Zürich, Switzerland',
  city: 'Zürich',
  district: 'Altstadt',
  street: 'Burgstraße 7',
  country: 'Switzerland',
};

function buildFakeSupabase() {
  return {
    client: {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
          createSignedUrl: vi
            .fn()
            .mockResolvedValue({ data: { signedUrl: 'https://fake.url' }, error: null }),
        }),
      },
    },
  };
}

function buildFakeGeocoding(result = ZURICH_RESULT) {
  return {
    reverse: vi.fn().mockResolvedValue(result),
  };
}

function buildFakeFilterService() {
  return {
    rules: vi.fn().mockReturnValue([]),
    activeCount: 0,
    clearAll: vi.fn(),
    matchesClientSide: vi.fn().mockReturnValue(true),
  };
}

function setup(geocodingResult = ZURICH_RESULT) {
  const fakeSupabase = buildFakeSupabase();
  const fakeGeocoding = buildFakeGeocoding(geocodingResult);
  const fakeFilter = buildFakeFilterService();

  TestBed.configureTestingModule({
    providers: [
      WorkspaceViewService,
      PropertyRegistryService,
      { provide: SupabaseService, useValue: fakeSupabase },
      { provide: GeocodingService, useValue: fakeGeocoding },
      { provide: FilterService, useValue: fakeFilter },
    ],
  });

  const service = TestBed.inject(WorkspaceViewService);
  return { service, fakeSupabase, fakeGeocoding };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WorkspaceViewService — address resolution', () => {
  it('resolves images with coordinates but no addressLabel', async () => {
    const { service, fakeGeocoding } = setup();

    const img = makeImage({ addressLabel: null });
    service.setActiveSelectionImages([img]);

    // Wait for the async resolution.
    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());

    expect(fakeGeocoding.reverse).toHaveBeenCalledWith(47.3769, 8.5417);
  });

  it('skips images that already have addressLabel', async () => {
    const { service, fakeGeocoding } = setup();

    const img = makeImage({ addressLabel: 'Already resolved' });
    service.setActiveSelectionImages([img]);

    await new Promise((r) => setTimeout(r, 50));

    expect(fakeGeocoding.reverse).not.toHaveBeenCalled();
  });

  it('skips images with no coordinates', async () => {
    const { service, fakeGeocoding } = setup();

    const img = makeImage({
      latitude: null as unknown as number,
      longitude: null as unknown as number,
      addressLabel: null,
    });
    service.setActiveSelectionImages([img]);

    await new Promise((r) => setTimeout(r, 50));

    expect(fakeGeocoding.reverse).not.toHaveBeenCalled();
  });

  it('deduplicates — one geocode call per unique lat/lng pair', async () => {
    const { service, fakeGeocoding } = setup();

    const images = [
      makeImage({ id: 'a', latitude: 47.3769, longitude: 8.5417, addressLabel: null }),
      makeImage({ id: 'b', latitude: 47.3769, longitude: 8.5417, addressLabel: null }),
      makeImage({ id: 'c', latitude: 46.948, longitude: 7.4474, addressLabel: null }),
    ];
    service.setActiveSelectionImages(images);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalledTimes(2));

    // Two unique coordinates → two calls.
    expect(fakeGeocoding.reverse).toHaveBeenCalledWith(47.3769, 8.5417);
    expect(fakeGeocoding.reverse).toHaveBeenCalledWith(46.948, 7.4474);
  });

  it('uses exact coordinates for dedup — no rounding', async () => {
    const { service, fakeGeocoding } = setup();

    // These differ by 0.0001 — should be two separate geocode calls.
    const images = [
      makeImage({ id: 'a', latitude: 47.3769, longitude: 8.5417, addressLabel: null }),
      makeImage({ id: 'b', latitude: 47.377, longitude: 8.5417, addressLabel: null }),
    ];
    service.setActiveSelectionImages(images);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalledTimes(2));
  });

  it('updates the DB via RPC for all images at the same coordinates', async () => {
    const { service, fakeSupabase, fakeGeocoding } = setup();

    const images = [
      makeImage({ id: 'img-1', latitude: 47.3769, longitude: 8.5417, addressLabel: null }),
      makeImage({ id: 'img-2', latitude: 47.3769, longitude: 8.5417, addressLabel: null }),
    ];
    service.setActiveSelectionImages(images);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());
    // Allow the RPC call to fire.
    await vi.waitFor(() => {
      const rpcCalls = fakeSupabase.client.rpc.mock.calls.filter(
        (c: string[]) => c[0] === 'bulk_update_image_addresses',
      );
      expect(rpcCalls.length).toBeGreaterThan(0);
    });

    const rpcCall = fakeSupabase.client.rpc.mock.calls.find(
      (c: string[]) => c[0] === 'bulk_update_image_addresses',
    )!;
    expect(rpcCall[1].p_image_ids).toEqual(expect.arrayContaining(['img-1', 'img-2']));
    expect(rpcCall[1].p_address_label).toBe('Burgstra\u00dfe 7, 8001 Z\u00fcrich, Switzerland');
  });

  it('patches the local rawImages signal with resolved address', async () => {
    const { service, fakeGeocoding } = setup();

    const img = makeImage({ id: 'img-1', addressLabel: null });
    service.setActiveSelectionImages([img]);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());
    // Allow signal update to propagate.
    await vi.waitFor(() => {
      const updated = service.rawImages().find((i) => i.id === 'img-1');
      expect(updated?.addressLabel).toBe('Burgstraße 7, 8001 Zürich, Switzerland');
    });

    const updated = service.rawImages().find((i) => i.id === 'img-1')!;
    expect(updated.city).toBe('Zürich');
    expect(updated.district).toBe('Altstadt');
    expect(updated.street).toBe('Burgstraße 7');
    expect(updated.country).toBe('Switzerland');
  });

  it('does not retry an image that is already being geocoded', async () => {
    const { service, fakeGeocoding } = setup();

    const img = makeImage({ id: 'img-1', addressLabel: null });

    // Trigger resolution twice quickly.
    service.setActiveSelectionImages([img]);
    service.setActiveSelectionImages([{ ...img }]);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    // Should only geocode once despite two setActiveSelectionImages calls.
    expect(fakeGeocoding.reverse).toHaveBeenCalledTimes(1);
  });

  it('continues resolving other groups when one geocode fails', async () => {
    const { service, fakeGeocoding } = setup();
    fakeGeocoding.reverse
      .mockResolvedValueOnce(null) // First coordinate fails
      .mockResolvedValueOnce(ZURICH_RESULT); // Second succeeds

    const images = [
      makeImage({ id: 'a', latitude: 10, longitude: 20, addressLabel: null }),
      makeImage({ id: 'b', latitude: 30, longitude: 40, addressLabel: null }),
    ];
    service.setActiveSelectionImages(images);

    await vi.waitFor(() => expect(fakeGeocoding.reverse).toHaveBeenCalledTimes(2));

    // Image 'b' should still get resolved even though 'a' failed.
    await vi.waitFor(() => {
      const updated = service.rawImages().find((i) => i.id === 'b');
      expect(updated?.addressLabel).toBe('Burgstraße 7, 8001 Zürich, Switzerland');
    });

    // Image 'a' should remain unresolved.
    const a = service.rawImages().find((i) => i.id === 'a');
    expect(a?.addressLabel).toBeNull();
  });
});

describe('WorkspaceViewService — grouping with addresses', () => {
  it('groups by district using resolved address data', async () => {
    const { service } = setup();

    const images = [
      makeImage({ id: 'a', district: 'Altstadt' }),
      makeImage({ id: 'b', district: 'Altstadt' }),
      makeImage({ id: 'c', district: 'Seefeld' }),
    ];
    service.setActiveSelectionImages(images);
    service.activeGroupings.set([{ id: 'district', label: 'District', icon: '' }]);

    const sections = service.groupedSections();
    expect(sections.length).toBe(2);

    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('Altstadt');
    expect(headings).toContain('Seefeld');
  });

  it('shows "Unknown district" for images without district', () => {
    const { service } = setup();

    const images = [makeImage({ id: 'a', district: null })];
    service.setActiveSelectionImages(images);
    service.activeGroupings.set([{ id: 'district', label: 'District', icon: '' }]);

    const sections = service.groupedSections();
    expect(sections[0].heading).toBe('Unknown district');
  });

  it('groups by city using resolved address data', () => {
    const { service } = setup();

    const images = [makeImage({ id: 'a', city: 'Zürich' }), makeImage({ id: 'b', city: 'Bern' })];
    service.setActiveSelectionImages(images);
    service.activeGroupings.set([{ id: 'city', label: 'City', icon: '' }]);

    const sections = service.groupedSections();
    expect(sections.length).toBe(2);
    expect(sections.map((s) => s.heading)).toContain('Zürich');
    expect(sections.map((s) => s.heading)).toContain('Bern');
  });
});

// ── Sort + Grouping Sync (WV-3b) ──────────────────────────────────────────────

describe('WorkspaceViewService — sort + grouping sync', () => {
  function setupSortGrouping() {
    const { service } = setup();

    // Seed images with diverse cities, projects, and dates for meaningful sorting.
    const images = [
      makeImage({
        id: 'z1',
        city: 'Zürich',
        projectName: 'Alpha',
        capturedAt: '2026-01-01T00:00:00Z',
      }),
      makeImage({
        id: 'b1',
        city: 'Berlin',
        projectName: 'Beta',
        capturedAt: '2026-03-01T00:00:00Z',
      }),
      makeImage({
        id: 'w1',
        city: 'Wien',
        projectName: 'Alpha',
        capturedAt: '2026-02-01T00:00:00Z',
      }),
      makeImage({
        id: 'b2',
        city: 'Berlin',
        projectName: 'Alpha',
        capturedAt: '2026-01-15T00:00:00Z',
      }),
      makeImage({
        id: 'z2',
        city: 'Zürich',
        projectName: 'Beta',
        capturedAt: '2026-02-15T00:00:00Z',
      }),
    ];
    service.setActiveSelectionImages(images);
    return service;
  }

  it('auto-prepends grouping keys to effectiveSorts', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    const effective = service.effectiveSorts();
    expect(effective[0]).toEqual({ key: 'city', direction: 'asc' });
    // Default user sort should follow
    expect(effective[1]).toEqual({ key: 'date-captured', direction: 'desc' });
  });

  it('groups are sorted alphabetically when grouping direction is asc', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    const sections = service.groupedSections();
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual(['Berlin', 'Wien', 'Zürich']);
  });

  it('groups are sorted reverse-alphabetically when grouping direction is desc', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);
    // Change city sort direction to descending
    service.activeSorts.set([
      { key: 'city', direction: 'desc' },
      { key: 'date-captured', direction: 'desc' },
    ]);

    const sections = service.groupedSections();
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual(['Zürich', 'Wien', 'Berlin']);
  });

  it('multi-level grouping respects sort directions for both levels', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([
      { id: 'city', label: 'City', icon: 'location_city' },
      { id: 'project', label: 'Project', icon: 'folder' },
    ]);

    const sections = service.groupedSections();
    // Top level should be city A→Z (default asc)
    expect(sections.map((s) => s.heading)).toEqual(['Berlin', 'Wien', 'Zürich']);

    // Berlin subgroups: Alpha, Beta (A→Z)
    const berlinSubs = sections[0].subGroups!;
    expect(berlinSubs.map((s) => s.heading)).toEqual(['Alpha', 'Beta']);
  });

  it('retains user sort direction when a property is added as grouping', () => {
    const service = setupSortGrouping();

    // User first activates city sort as descending
    service.activeSorts.set([
      { key: 'date-captured', direction: 'desc' },
      { key: 'city', direction: 'desc' },
    ]);

    // Then city is added as a grouping
    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    const effective = service.effectiveSorts();
    // City should be first (grouping position) and retain desc direction
    expect(effective[0]).toEqual({ key: 'city', direction: 'desc' });
  });

  it('removes grouping-only sort key when grouping is removed', () => {
    const service = setupSortGrouping();

    // Activate grouping — city gets auto-added to sorts
    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);
    expect(service.effectiveSorts().some((s) => s.key === 'city')).toBe(true);

    // Remove the grouping
    service.activeGroupings.set([]);

    const effective = service.effectiveSorts();
    // City was grouping-only — should be gone
    expect(effective.some((s) => s.key === 'city')).toBe(false);
    // Default sort remains
    expect(effective).toEqual([{ key: 'date-captured', direction: 'desc' }]);
  });

  it('keeps user-defined sort when grouping of same key is removed', () => {
    const service = setupSortGrouping();

    // User explicitly adds city sort first
    service.activeSorts.set([
      { key: 'date-captured', direction: 'desc' },
      { key: 'city', direction: 'asc' },
    ]);

    // Then grouping is added for city
    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    // Then grouping is removed
    service.activeGroupings.set([]);

    const effective = service.effectiveSorts();
    // City was in user sorts before grouping — should remain
    expect(effective.some((s) => s.key === 'city')).toBe(true);
  });

  it('effectiveSorts deduplicates grouping keys already in user sorts', () => {
    const service = setupSortGrouping();

    // User has city in their sorts
    service.activeSorts.set([
      { key: 'date-captured', direction: 'desc' },
      { key: 'city', direction: 'desc' },
    ]);

    // Add city as grouping
    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    const effective = service.effectiveSorts();
    // City should appear exactly once (at grouping position)
    const cityEntries = effective.filter((s) => s.key === 'city');
    expect(cityEntries.length).toBe(1);
    expect(effective[0].key).toBe('city');
  });

  it('images within a group are sorted by remaining sort keys', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);
    // Default: date-captured desc — within Berlin group, b1 (March) should come before b2 (Jan)

    const sections = service.groupedSections();
    const berlin = sections.find((s) => s.heading === 'Berlin')!;
    expect(berlin.images[0].id).toBe('b1'); // March — newest first
    expect(berlin.images[1].id).toBe('b2'); // January
  });

  it('changing sort direction on grouped property reorders groups', () => {
    const service = setupSortGrouping();

    service.activeGroupings.set([{ id: 'city', label: 'City', icon: 'location_city' }]);

    // Verify initial A→Z order
    let sections = service.groupedSections();
    expect(sections[0].heading).toBe('Berlin');

    // Change city to descending
    service.activeSorts.set([
      { key: 'city', direction: 'desc' },
      { key: 'date-captured', direction: 'desc' },
    ]);

    sections = service.groupedSections();
    expect(sections[0].heading).toBe('Zürich');
    expect(sections[2].heading).toBe('Berlin');
  });
});

// ── Numeric sorting (custom number properties) ────────────────────────────────

describe('WorkspaceViewService — numeric sorting', () => {
  it('sorts number-type custom properties numerically, not lexicographically', () => {
    const { service } = setup();
    const registry = TestBed.inject(PropertyRegistryService);

    registry.setCustomProperties([{ id: 'fang', key_name: 'Fang', key_type: 'number' }]);

    const images = [
      makeImage({ id: 'a', metadata: { fang: '100' } }),
      makeImage({ id: 'b', metadata: { fang: '5' } }),
      makeImage({ id: 'c', metadata: { fang: '12' } }),
      makeImage({ id: 'd', metadata: { fang: '1' } }),
    ];
    service.setActiveSelectionImages(images);
    service.activeSorts.set([{ key: 'fang', direction: 'asc' }]);

    const sorted = service.groupedSections()[0].images;
    // Numeric order: 1, 5, 12, 100 (not lexicographic "1", "100", "12", "5")
    expect(sorted.map((i) => i.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('sorts number-type custom properties descending', () => {
    const { service } = setup();
    const registry = TestBed.inject(PropertyRegistryService);

    registry.setCustomProperties([{ id: 'fang', key_name: 'Fang', key_type: 'number' }]);

    const images = [
      makeImage({ id: 'a', metadata: { fang: '1' } }),
      makeImage({ id: 'b', metadata: { fang: '100' } }),
      makeImage({ id: 'c', metadata: { fang: '12' } }),
    ];
    service.setActiveSelectionImages(images);
    service.activeSorts.set([{ key: 'fang', direction: 'desc' }]);

    const sorted = service.groupedSections()[0].images;
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('pushes null metadata values to the end during numeric sort', () => {
    const { service } = setup();
    const registry = TestBed.inject(PropertyRegistryService);

    registry.setCustomProperties([{ id: 'fang', key_name: 'Fang', key_type: 'number' }]);

    const images = [
      makeImage({ id: 'a', metadata: { fang: '5' } }),
      makeImage({ id: 'b' }), // no metadata
      makeImage({ id: 'c', metadata: { fang: '1' } }),
    ];
    service.setActiveSelectionImages(images);
    service.activeSorts.set([{ key: 'fang', direction: 'asc' }]);

    const sorted = service.groupedSections()[0].images;
    expect(sorted[0].id).toBe('c'); // 1
    expect(sorted[1].id).toBe('a'); // 5
    expect(sorted[2].id).toBe('b'); // null → end
  });

  it('groups by number-type custom property', () => {
    const { service } = setup();
    const registry = TestBed.inject(PropertyRegistryService);

    registry.setCustomProperties([{ id: 'floor', key_name: 'Floor', key_type: 'number' }]);

    const images = [
      makeImage({ id: 'a', metadata: { floor: '1' } }),
      makeImage({ id: 'b', metadata: { floor: '2' } }),
      makeImage({ id: 'c', metadata: { floor: '1' } }),
    ];
    service.setActiveSelectionImages(images);
    service.activeGroupings.set([{ id: 'floor', label: 'Floor', icon: 'numbers' }]);

    const sections = service.groupedSections();
    expect(sections.length).toBe(2);
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('Floor 1');
    expect(headings).toContain('Floor 2');
  });
});

// ── Integration: loadCustomProperties → registry → dropdown signals ────────────

describe('WorkspaceViewService — loadCustomProperties integration', () => {
  it('loads metadata_keys from Supabase and registers them in PropertyRegistryService', async () => {
    const fakeMetadataKeys = [
      { id: 'uuid-bauphase', key_name: 'Bauphase' },
      { id: 'uuid-fang', key_name: 'Fang' },
    ];
    const fakeSupabase = buildFakeSupabase();
    // Override the from('metadata_keys') chain to return our fake data
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: fakeMetadataKeys, error: null }),
        };
      }
      // Default for other tables (image_metadata, images, etc.)
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
        { provide: FilterService, useValue: buildFakeFilterService() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);

    // Before loading: only built-in properties
    const builtInCount = registry.allProperties().length;
    expect(registry.allProperties().every((p) => p.builtIn)).toBe(true);

    // Load custom properties (the method under test)
    await service.loadCustomProperties();

    // After loading: custom properties appear in the registry
    expect(registry.allProperties().length).toBe(builtInCount + 2);
    expect(registry.allProperties().some((p) => p.label === 'Bauphase')).toBe(true);
    expect(registry.allProperties().some((p) => p.label === 'Fang')).toBe(true);

    // Custom properties show up in all dropdown lists
    expect(registry.sortableProperties().some((p) => p.label === 'Bauphase')).toBe(true);
    expect(registry.groupableProperties().some((p) => p.label === 'Fang')).toBe(true);
    expect(registry.filterableProperties().some((p) => p.label === 'Bauphase')).toBe(true);
  });

  it('custom properties are not marked as builtIn after loading', async () => {
    const fakeMetadataKeys = [{ id: 'uuid-floor', key_name: 'Floor' }];
    const fakeSupabase = buildFakeSupabase();
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: fakeMetadataKeys, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
        { provide: FilterService, useValue: buildFakeFilterService() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);

    await service.loadCustomProperties();

    const floorProp = registry.getProperty('uuid-floor');
    expect(floorProp).toBeDefined();
    expect(floorProp!.builtIn).toBe(false);
    expect(floorProp!.label).toBe('Floor');
  });

  it('handles empty metadata_keys gracefully', async () => {
    const fakeSupabase = buildFakeSupabase();
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
        { provide: FilterService, useValue: buildFakeFilterService() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);
    const before = registry.allProperties().length;

    await service.loadCustomProperties();

    expect(registry.allProperties().length).toBe(before);
  });

  it('end-to-end: load custom property → add metadata to image → group by it', async () => {
    const fakeMetadataKeys = [{ id: 'uuid-bauphase', key_name: 'Bauphase' }];
    const fakeSupabase = buildFakeSupabase();
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: fakeMetadataKeys, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
        { provide: FilterService, useValue: buildFakeFilterService() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);

    // Step 1: Load custom properties from DB
    await service.loadCustomProperties();
    expect(registry.groupableProperties().some((p) => p.label === 'Bauphase')).toBe(true);

    // Step 2: Add images with metadata values
    const images = [
      makeImage({ id: 'a', metadata: { 'uuid-bauphase': 'Rohbau' } }),
      makeImage({ id: 'b', metadata: { 'uuid-bauphase': 'Innenausbau' } }),
      makeImage({ id: 'c', metadata: { 'uuid-bauphase': 'Rohbau' } }),
      makeImage({ id: 'd' }), // no Bauphase
    ];
    service.setActiveSelectionImages(images);

    // Step 3: Group by Bauphase
    service.activeGroupings.set([{ id: 'uuid-bauphase', label: 'Bauphase', icon: 'tag' }]);

    // Step 4: Verify groups
    const sections = service.groupedSections();
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('Bauphase Rohbau');
    expect(headings).toContain('Bauphase Innenausbau');
    expect(headings).toContain('No Bauphase');

    const rohbau = sections.find((s) => s.heading === 'Bauphase Rohbau')!;
    expect(rohbau.images.length).toBe(2);
  });

  it('end-to-end: load custom property → add metadata → sort numerically', async () => {
    const fakeMetadataKeys = [{ id: 'uuid-fang', key_name: 'Fang' }];
    const fakeSupabase = buildFakeSupabase();
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: fakeMetadataKeys, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
        { provide: FilterService, useValue: buildFakeFilterService() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);

    // Step 1: Load custom properties — Fang defaults to 'text' type from DB
    await service.loadCustomProperties();
    expect(registry.sortableProperties().some((p) => p.label === 'Fang')).toBe(true);

    // Step 2: Add images with numeric metadata
    const images = [
      makeImage({ id: 'a', metadata: { 'uuid-fang': '100' } }),
      makeImage({ id: 'b', metadata: { 'uuid-fang': '5' } }),
      makeImage({ id: 'c', metadata: { 'uuid-fang': '12' } }),
    ];
    service.setActiveSelectionImages(images);

    // Step 3: Sort by Fang ascending
    service.activeSorts.set([{ key: 'uuid-fang', direction: 'asc' }]);

    // Step 4: Verify text-type sort (since DB has no key_type, defaults to text)
    // Text sort ascending: '100' < '12' < '5' (lexicographic)
    const sorted = service.groupedSections()[0].images;
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('end-to-end: load custom property → add metadata → filter by it', async () => {
    const fakeMetadataKeys = [{ id: 'uuid-bauphase', key_name: 'Bauphase' }];
    const fakeSupabase = buildFakeSupabase();
    fakeSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'metadata_keys') {
        return {
          select: vi.fn().mockResolvedValue({ data: fakeMetadataKeys, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    // Use real FilterService for the integration test
    TestBed.configureTestingModule({
      providers: [
        WorkspaceViewService,
        PropertyRegistryService,
        FilterService,
        { provide: SupabaseService, useValue: fakeSupabase },
        { provide: GeocodingService, useValue: buildFakeGeocoding() },
      ],
    });

    const service = TestBed.inject(WorkspaceViewService);
    const registry = TestBed.inject(PropertyRegistryService);
    const filterService = TestBed.inject(FilterService);

    // Step 1: Load custom properties
    await service.loadCustomProperties();
    expect(registry.filterableProperties().some((p) => p.label === 'Bauphase')).toBe(true);

    // Step 2: Add images with metadata
    const images = [
      makeImage({ id: 'a', metadata: { 'uuid-bauphase': 'Rohbau' } }),
      makeImage({ id: 'b', metadata: { 'uuid-bauphase': 'Innenausbau' } }),
      makeImage({ id: 'c', metadata: { 'uuid-bauphase': 'Rohbau' } }),
    ];
    service.setActiveSelectionImages(images);

    // Step 3: Add a filter rule for Bauphase = "Rohbau"
    filterService.addRule();
    const ruleId = filterService.rules()[0].id;
    filterService.updateRule(ruleId, {
      property: 'uuid-bauphase',
      operator: 'is',
      value: 'Rohbau',
    });

    // Step 4: Verify filtered results
    const sections = service.groupedSections();
    const allImages = sections.flatMap((s) => s.images);
    expect(allImages.length).toBe(2);
    expect(allImages.every((img) => img.metadata?.['uuid-bauphase'] === 'Rohbau')).toBe(true);
  });
});
