/**
 * GeocodingService unit tests.
 *
 * Strategy:
 *  - `fetch` is mocked globally via vi.fn() — no real HTTP calls.
 *  - Each test verifies correct URL building, response parsing, caching, and rate limiting.
 *  - Arrange–Act–Assert; one behavior per `it` block.
 */

import { TestBed } from '@angular/core/testing';
import { GeocodingService, type ReverseGeocodeResult } from './geocoding.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a realistic Nominatim reverse-geocode JSON response. */
function nominatimResponse(overrides: Record<string, unknown> = {}) {
  return {
    display_name: 'Burgstraße 7, 8001 Zürich, Switzerland',
    address: {
      road: 'Burgstraße',
      house_number: '7',
      city: 'Zürich',
      city_district: 'Altstadt',
      suburb: undefined,
      borough: undefined,
      quarter: undefined,
      county: 'Bezirk Zürich',
      state: 'Zürich',
      country: 'Switzerland',
      postcode: '8001',
      ...overrides,
    },
  };
}

function okFetchResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as Response;
}

function errorFetchResponse(status = 500): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GeocodingService', () => {
  let service: GeocodingService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    TestBed.configureTestingModule({
      providers: [GeocodingService],
    });
    service = TestBed.inject(GeocodingService);

    // Reset the internal rate-limit timer so tests don't wait.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).lastRequestTime = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── reverse() — successful resolution ────────────────────────────────────

  it('returns structured address fields from a Nominatim response', async () => {
    fetchSpy.mockResolvedValueOnce(okFetchResponse(nominatimResponse()));

    const result = await service.reverse(47.3769, 8.5417);

    expect(result).not.toBeNull();
    expect(result!.city).toBe('Zürich');
    expect(result!.district).toBe('Altstadt');
    expect(result!.street).toBe('Burgstraße 7');
    expect(result!.country).toBe('Switzerland');
    expect(result!.addressLabel).toBe('Burgstraße 7, 8001 Zürich, Switzerland');
  });

  it('calls Nominatim with correct URL parameters', async () => {
    fetchSpy.mockResolvedValueOnce(okFetchResponse(nominatimResponse()));

    await service.reverse(47.3769, 8.5417);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url: string = fetchSpy.mock.calls[0][0];
    expect(url).toContain('lat=47.3769');
    expect(url).toContain('lon=8.5417');
    expect(url).toContain('format=json');
    expect(url).toContain('addressdetails=1');
  });

  // ── reverse() — fallback address fields ──────────────────────────────────

  it('falls back to town when city is absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(nominatimResponse({ city: undefined, town: 'Winterthur' })),
    );

    const result = await service.reverse(47.5, 8.7);

    expect(result!.city).toBe('Winterthur');
  });

  it('falls back to village when city and town are absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(
        nominatimResponse({ city: undefined, town: undefined, village: 'Grindelwald' }),
      ),
    );

    const result = await service.reverse(46.6, 8.0);

    expect(result!.city).toBe('Grindelwald');
  });

  it('falls back to suburb when city_district is absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(nominatimResponse({ city_district: undefined, suburb: 'Wiedikon' })),
    );

    const result = await service.reverse(47.3, 8.5);

    expect(result!.district).toBe('Wiedikon');
  });

  it('returns null district when no district fields are present', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(
        nominatimResponse({
          city_district: undefined,
          suburb: undefined,
          borough: undefined,
          quarter: undefined,
        }),
      ),
    );

    const result = await service.reverse(47.3, 8.5);

    expect(result!.district).toBeNull();
  });

  it('returns null street when road is absent', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(nominatimResponse({ road: undefined, house_number: undefined })),
    );

    const result = await service.reverse(47.3, 8.5);

    expect(result!.street).toBeNull();
  });

  it('concatenates road and house_number into street', async () => {
    fetchSpy.mockResolvedValueOnce(
      okFetchResponse(nominatimResponse({ road: 'Bahnhofstrasse', house_number: '12' })),
    );

    const result = await service.reverse(47.37, 8.54);

    expect(result!.street).toBe('Bahnhofstrasse 12');
  });

  // ── reverse() — error handling ───────────────────────────────────────────

  it('returns null when Nominatim returns a non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(errorFetchResponse(500));

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  it('returns null when the response has no address object', async () => {
    fetchSpy.mockResolvedValueOnce(okFetchResponse({ display_name: 'Somewhere' }));

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  it('returns null when fetch throws a network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  // ── Caching ──────────────────────────────────────────────────────────────

  it('caches the result and does not call fetch on the second request for the same coords', async () => {
    fetchSpy.mockResolvedValue(okFetchResponse(nominatimResponse()));

    await service.reverse(47.3769, 8.5417);
    const second = await service.reverse(47.3769, 8.5417);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second!.city).toBe('Zürich');
  });

  it('calls fetch again when cache has expired', async () => {
    fetchSpy.mockResolvedValue(okFetchResponse(nominatimResponse()));

    await service.reverse(47.3769, 8.5417);

    // Expire the cache entry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = (service as any).cache as Map<
      string,
      { data: ReverseGeocodeResult; expires: number }
    >;
    for (const entry of cache.values()) {
      entry.expires = Date.now() - 1;
    }

    await service.reverse(47.3769, 8.5417);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('caches a different entry for different coordinates', async () => {
    fetchSpy
      .mockResolvedValueOnce(okFetchResponse(nominatimResponse()))
      .mockResolvedValueOnce(okFetchResponse(nominatimResponse({ city: 'Bern' })));

    const a = await service.reverse(47.3769, 8.5417);
    const b = await service.reverse(46.948, 7.4474);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(a!.city).toBe('Zürich');
    expect(b!.city).toBe('Bern');
  });
});
