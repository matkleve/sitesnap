import { TestBed } from '@angular/core/testing';
import { SearchBarService, DetectedCoordinates } from './search-bar.service';
import { SupabaseService } from '../supabase.service';
import { GeocodingService } from '../geocoding.service';
import { firstValueFrom } from 'rxjs';

function createQueryBuilder(result: { data: unknown[]; error: unknown }) {
  const builder = {
    select: vi.fn(),
    ilike: vi.fn(),
    not: vi.fn(),
    limit: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.not.mockReturnValue(builder);
  builder.limit.mockResolvedValue(result);

  return builder;
}

describe('SearchBarService', () => {
  let service: SearchBarService;
  let supabaseMock: { client: { from: ReturnType<typeof vi.fn> } };
  let geocodingMock: {
    search: ReturnType<typeof vi.fn>;
    reverse: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();

    const imagesBuilder = createQueryBuilder({
      data: [
        {
          id: 'img-1',
          address_label: 'Schleiergasse 18, 1100 Wien',
          street: 'Schleiergasse 18',
          city: 'Wien',
          latitude: 48.1746,
          longitude: 16.3823,
        },
        {
          id: 'img-2',
          address_label: 'Schleiergasse 18, 1100 Wien',
          street: 'Schleiergasse 18',
          city: 'Wien',
          latitude: 48.1747,
          longitude: 16.3824,
        },
      ],
      error: null,
    });

    const projectsBuilder = createQueryBuilder({
      data: [{ id: 'project-1', name: 'Schleiergasse Renovation' }],
      error: null,
    });

    const groupsBuilder = createQueryBuilder({
      data: [],
      error: null,
    });

    supabaseMock = {
      client: {
        from: vi.fn((table: string) => {
          if (table === 'images') return imagesBuilder;
          if (table === 'projects') return projectsBuilder;
          if (table === 'saved_groups') return groupsBuilder;
          return createQueryBuilder({ data: [], error: null });
        }),
      },
    };

    geocodingMock = {
      search: vi.fn().mockResolvedValue([
        {
          lat: 48.1746,
          lng: 16.3823,
          displayName: 'Schleiergasse 18, Wien, Austria',
          name: null,
          importance: 0.6,
          address: {
            road: 'Schleiergasse',
            house_number: '18',
            postcode: '1100',
            city: 'Wien',
            country: 'Austria',
          },
        },
      ]),
      reverse: vi.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      providers: [
        SearchBarService,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: GeocodingService, useValue: geocodingMock },
      ],
    });

    service = TestBed.inject(SearchBarService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Recent Searches ──────────────────────────────────────────────────

  describe('recent searches', () => {
    it('returns an empty array when no recents are stored', () => {
      expect(service.loadRecentSearches()).toEqual([]);
    });

    it('persists and loads recent searches from localStorage', () => {
      service.addRecentSearch('Schleiergasse 18, 1100 Wien');
      const recents = service.loadRecentSearches();
      expect(recents.length).toBe(1);
      expect(recents[0].label).toBe('Schleiergasse 18, 1100 Wien');
    });

    it('deduplicates by label (case-insensitive) and moves to front', () => {
      service.addRecentSearch('Burgstrasse 7, Zurich');
      service.addRecentSearch('Schleiergasse 18, Wien');
      service.addRecentSearch('burgstrasse 7, zurich');

      const recents = service.loadRecentSearches();
      expect(recents.length).toBe(2);
      expect(recents[0].label).toBe('burgstrasse 7, zurich');
    });

    it('caps at 20 entries with LRU eviction', () => {
      for (let i = 0; i < 25; i++) {
        service.addRecentSearch(`Address ${i}`);
      }
      expect(service.loadRecentSearches().length).toBe(20);
    });

    it('ranks active-project recents first', () => {
      service.addRecentSearch('Other address', 'project-b');
      service.addRecentSearch('Active address', 'project-a');
      service.addRecentSearch('Another other', 'project-b');

      const ranked = service.getRecentSearches(10, 'project-a');
      expect(ranked[0].label).toBe('Active address');
    });
  });

  // ── Address Formatting ───────────────────────────────────────────────

  describe('formatAddressLabel', () => {
    it('formats full address as "Street Number, Postcode City"', () => {
      const result = service.formatAddressLabel({
        lat: 48.17,
        lng: 16.38,
        displayName: 'verbose nominatim label',
        name: null,
        importance: 0.5,
        address: {
          road: 'Schleiergasse',
          house_number: '18',
          postcode: '1100',
          city: 'Wien',
        },
      });
      expect(result).toBe('Schleiergasse 18, 1100 Wien');
    });

    it('formats without house number', () => {
      const result = service.formatAddressLabel({
        lat: 48.17,
        lng: 16.38,
        displayName: 'verbose',
        name: null,
        importance: 0.5,
        address: { road: 'Schleiergasse', postcode: '1100', city: 'Wien' },
      });
      expect(result).toBe('Schleiergasse, 1100 Wien');
    });

    it('falls back to city only', () => {
      const result = service.formatAddressLabel({
        lat: 48.17,
        lng: 16.38,
        displayName: 'verbose',
        name: null,
        importance: 0.5,
        address: { city: 'Wien' },
      });
      expect(result).toBe('Wien');
    });

    it('truncates raw display_name as last resort', () => {
      const long = 'A'.repeat(100);
      const result = service.formatAddressLabel({
        lat: 48.17,
        lng: 16.38,
        displayName: long,
        name: null,
        importance: 0.5,
        address: null,
      });
      expect(result.length).toBeLessThanOrEqual(61);
    });

    it('uses town as fallback for city', () => {
      const result = service.formatAddressLabel({
        lat: 48.17,
        lng: 16.38,
        displayName: 'verbose',
        name: null,
        importance: 0.5,
        address: { road: 'Hauptstrasse', house_number: '1', town: 'Mödling' },
      });
      expect(result).toBe('Hauptstrasse 1, Mödling');
    });
  });

  // ── DB Address Resolution ────────────────────────────────────────────

  describe('resolveDbAddresses', () => {
    it('returns grouped address candidates', async () => {
      const results = await firstValueFrom(service.resolveDbAddresses('schleier', {}));
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].family).toBe('db-address');
      expect(results[0].imageCount).toBe(2);
    });

    it('returns empty array for empty query', async () => {
      const results = await firstValueFrom(service.resolveDbAddresses('', {}));
      expect(results).toEqual([]);
    });

    it('applies dataGravity (imageCount) to scoring', async () => {
      const results = await firstValueFrom(service.resolveDbAddresses('schleier', {}));
      // Score should be textMatch × log2(imageCount + 1)
      // With 2 images: log2(3) ≈ 1.585
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  // ── DB Content Resolution ────────────────────────────────────────────

  describe('resolveDbContent', () => {
    it('returns project and group candidates', async () => {
      const results = await firstValueFrom(service.resolveDbContent('schleier', {}));
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].family).toBe('db-content');
      expect(results[0].contentType).toBe('project');
    });

    it('returns empty array for empty query', async () => {
      const results = await firstValueFrom(service.resolveDbContent('', {}));
      expect(results).toEqual([]);
    });
  });

  // ── Geocoder Resolution ──────────────────────────────────────────────

  describe('resolveGeocoder', () => {
    it('returns geocoder candidates via GeocodingService', async () => {
      const results = await firstValueFrom(service.resolveGeocoder('schleiergasse', {}));
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].family).toBe('geocoder');
      expect(results[0].label).toBe('Schleiergasse 18, 1100 Wien');
    });

    it('passes countrycodes and viewbox when context has them', async () => {
      await firstValueFrom(
        service.resolveGeocoder('schleiergasse', {
          countryCodes: ['at'],
          viewportBounds: { north: 49, east: 17, south: 47, west: 15 },
        }),
      );

      expect(geocodingMock.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          countrycodes: ['at'],
          viewbox: '15,49,17,47',
        }),
      );
    });

    it('returns empty array on geocoder failure', async () => {
      geocodingMock.search.mockRejectedValue(new Error('network'));
      const results = await firstValueFrom(service.resolveGeocoder('schleiergasse', {}));
      expect(results).toEqual([]);
    });

    it('handles POI results with secondary label', async () => {
      geocodingMock.search.mockResolvedValue([
        {
          lat: 48.17,
          lng: 16.38,
          displayName: 'Kuratorium für Verkehrssicherheit, Schleiergasse',
          name: 'Kuratorium für Verkehrssicherheit',
          importance: 0.7,
          address: {
            road: 'Schleiergasse',
            house_number: '18',
            postcode: '1100',
            city: 'Wien',
          },
        },
      ]);

      const results = await firstValueFrom(service.resolveGeocoder('kuratorium', {}));
      expect(results[0].label).toBe('Kuratorium für Verkehrssicherheit');
      expect(results[0].secondaryLabel).toBe('Schleiergasse 18, 1100 Wien');
    });
  });

  // ── Query Normalization ──────────────────────────────────────────────

  describe('normalizeSearchQuery', () => {
    it('lowercases and strips diacritics', () => {
      expect(service.normalizeSearchQuery('Straße')).toBe('strasse');
    });

    it('corrects street abbreviations', () => {
      expect(service.normalizeSearchQuery('schleier g.')).toBe('schleier gasse');
      expect(service.normalizeSearchQuery('burg str.')).toBe('burg strasse');
    });
  });

  describe('buildFallbackQueries', () => {
    it('returns distinct fallback variants', () => {
      const fallbacks = service.buildFallbackQueries('schleiergase 18');
      expect(fallbacks.length).toBeGreaterThan(0);
      expect(fallbacks).toContain('schleiergasse 18');
    });
  });

  // ── Coordinate Detection ─────────────────────────────────────────────

  describe('detectCoordinates', () => {
    it('detects decimal coordinates with comma separator', () => {
      const result = service.detectCoordinates('47.3769, 8.5417');
      expect(result).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('detects decimal coordinates with space separator', () => {
      const result = service.detectCoordinates('47.3769 8.5417');
      expect(result).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('detects DMS coordinates', () => {
      const result = service.detectCoordinates('47°22\'36.8"N 8°32\'30.1"E');
      expect(result).not.toBeNull();
      expect(result!.lat).toBeCloseTo(47.377, 2);
      expect(result!.lng).toBeCloseTo(8.5417, 2);
    });

    it('detects Google Maps @lat,lng URLs', () => {
      const result = service.detectCoordinates('https://www.google.com/maps/@47.3769,8.5417,15z');
      expect(result).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('detects Google Maps ?ll= URLs', () => {
      const result = service.detectCoordinates('https://maps.google.com/?ll=47.3769,8.5417');
      expect(result).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('detects Google Maps ?q= URLs', () => {
      const result = service.detectCoordinates('https://www.google.com/maps?q=47.3769,8.5417');
      expect(result).toEqual({ lat: 47.3769, lng: 8.5417 });
    });

    it('returns null for out-of-range coordinates', () => {
      expect(service.detectCoordinates('91, 181')).toBeNull();
    });

    it('returns null for regular text input', () => {
      expect(service.detectCoordinates('Schleiergasse 18')).toBeNull();
    });

    it('handles negative coordinates', () => {
      const result = service.detectCoordinates('-33.8688, 151.2093');
      expect(result).toEqual({ lat: -33.8688, lng: 151.2093 });
    });
  });

  // ── Ghost Completion ─────────────────────────────────────────────────

  describe('ghost completion', () => {
    it('returns suffix for a matching prefix', () => {
      service.buildGhostTrie([
        { label: 'Schleiergasse 18, 1100 Wien', weight: 100 },
        { label: 'Burgstrasse 7, Zurich', weight: 50 },
      ]);

      const ghost = service.queryGhostCompletion('schlei');
      expect(ghost).toBe('ergasse 18, 1100 Wien');
    });

    it('returns null when no prefix matches', () => {
      service.buildGhostTrie([{ label: 'Schleiergasse 18', weight: 100 }]);
      expect(service.queryGhostCompletion('xyz')).toBeNull();
    });

    it('returns the highest-weight match when multiple prefixes match', () => {
      service.buildGhostTrie([
        { label: 'Schleiergasse 18, 1100 Wien', weight: 50 },
        { label: 'Schleiergasse 20, 1100 Wien', weight: 100 },
      ]);

      const ghost = service.queryGhostCompletion('schleier');
      expect(ghost).toContain('20');
    });

    it('returns null for empty input', () => {
      service.buildGhostTrie([{ label: 'Test', weight: 100 }]);
      expect(service.queryGhostCompletion('')).toBeNull();
    });
  });
});
