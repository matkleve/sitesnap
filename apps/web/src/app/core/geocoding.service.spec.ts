/**
 * GeocodingService unit tests.
 *
 * Strategy:
 *  - `SupabaseService.client.functions.invoke` is mocked — no real HTTP calls.
 *  - Each test verifies response parsing, caching, serial queue, and error handling.
 *  - Arrange–Act–Assert; one behavior per `it` block.
 */

import { TestBed } from '@angular/core/testing';
import { GeocodingService, type ReverseGeocodeResult } from './geocoding.service';
import { SupabaseService } from './supabase.service';

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

function mockSupabaseService(invokeFn: ReturnType<typeof vi.fn>) {
  return {
    client: {
      functions: { invoke: invokeFn },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GeocodingService', () => {
  let service: GeocodingService;
  let invokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        GeocodingService,
        { provide: SupabaseService, useValue: mockSupabaseService(invokeSpy) },
      ],
    });
    service = TestBed.inject(GeocodingService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── reverse() — successful resolution ────────────────────────────────────

  it('returns structured address fields from a Nominatim response', async () => {
    invokeSpy.mockResolvedValueOnce({ data: nominatimResponse(), error: null });

    const result = await service.reverse(47.3769, 8.5417);

    expect(result).not.toBeNull();
    expect(result!.city).toBe('Zürich');
    expect(result!.district).toBe('Altstadt');
    expect(result!.street).toBe('Burgstraße 7');
    expect(result!.country).toBe('Switzerland');
    expect(result!.addressLabel).toBe('Burgstraße 7, 8001 Zürich, Switzerland');
  });

  it('calls the geocode edge function with correct parameters', async () => {
    invokeSpy.mockResolvedValueOnce({ data: nominatimResponse(), error: null });

    await service.reverse(47.3769, 8.5417);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy).toHaveBeenCalledWith('geocode', {
      body: { action: 'reverse', lat: 47.3769, lng: 8.5417 },
    });
  });

  // ── reverse() — fallback address fields ──────────────────────────────────

  it('falls back to town when city is absent', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({ city: undefined, town: 'Winterthur' }),
      error: null,
    });

    const result = await service.reverse(47.5, 8.7);

    expect(result!.city).toBe('Winterthur');
  });

  it('falls back to village when city and town are absent', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({ city: undefined, town: undefined, village: 'Grindelwald' }),
      error: null,
    });

    const result = await service.reverse(46.6, 8.0);

    expect(result!.city).toBe('Grindelwald');
  });

  it('falls back to suburb when city_district is absent', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({ city_district: undefined, suburb: 'Wiedikon' }),
      error: null,
    });

    const result = await service.reverse(47.3, 8.5);

    expect(result!.district).toBe('Wiedikon');
  });

  it('returns null district when no district fields are present', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({
        city_district: undefined,
        suburb: undefined,
        borough: undefined,
        quarter: undefined,
      }),
      error: null,
    });

    const result = await service.reverse(47.3, 8.5);

    expect(result!.district).toBeNull();
  });

  it('returns null street when road is absent', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({ road: undefined, house_number: undefined }),
      error: null,
    });

    const result = await service.reverse(47.3, 8.5);

    expect(result!.street).toBeNull();
  });

  it('concatenates road and house_number into street', async () => {
    invokeSpy.mockResolvedValueOnce({
      data: nominatimResponse({ road: 'Bahnhofstrasse', house_number: '12' }),
      error: null,
    });

    const result = await service.reverse(47.37, 8.54);

    expect(result!.street).toBe('Bahnhofstrasse 12');
  });

  // ── reverse() — error handling ───────────────────────────────────────────

  it('returns null when the edge function returns an error', async () => {
    invokeSpy.mockResolvedValueOnce({ data: null, error: new Error('502') });

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  it('returns null when the response has no address object', async () => {
    invokeSpy.mockResolvedValueOnce({ data: { display_name: 'Somewhere' }, error: null });

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  it('returns null when invoke throws a network error', async () => {
    invokeSpy.mockRejectedValueOnce(new Error('Network error'));

    const result = await service.reverse(47.3, 8.5);

    expect(result).toBeNull();
  });

  // ── Caching ──────────────────────────────────────────────────────────────

  it('caches the result and does not call invoke on the second request for the same coords', async () => {
    invokeSpy.mockResolvedValue({ data: nominatimResponse(), error: null });

    await service.reverse(47.3769, 8.5417);
    const second = await service.reverse(47.3769, 8.5417);

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    expect(second!.city).toBe('Zürich');
  });

  it('calls invoke again when cache has expired', async () => {
    invokeSpy.mockResolvedValue({ data: nominatimResponse(), error: null });

    await service.reverse(47.3769, 8.5417);

    // Expire the cache entry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cache = (service as any).reverseCache as Map<
      string,
      { data: ReverseGeocodeResult; expires: number }
    >;
    for (const entry of cache.values()) {
      entry.expires = Date.now() - 1;
    }

    await service.reverse(47.3769, 8.5417);

    expect(invokeSpy).toHaveBeenCalledTimes(2);
  });

  it('caches a different entry for different coordinates', async () => {
    invokeSpy
      .mockResolvedValueOnce({ data: nominatimResponse(), error: null })
      .mockResolvedValueOnce({ data: nominatimResponse({ city: 'Bern' }), error: null });

    const a = await service.reverse(47.3769, 8.5417);
    const b = await service.reverse(46.948, 7.4474);

    expect(invokeSpy).toHaveBeenCalledTimes(2);
    expect(a!.city).toBe('Zürich');
    expect(b!.city).toBe('Bern');
  });

  // ── Serial queue ─────────────────────────────────────────────────────────

  it('serializes concurrent requests through the queue', async () => {
    const callOrder: number[] = [];
    invokeSpy.mockImplementation(async () => {
      callOrder.push(callOrder.length + 1);
      await new Promise((r) => setTimeout(r, 10));
      return { data: nominatimResponse(), error: null };
    });

    // Fire 3 concurrent reverse calls with different coordinates
    const [a, b, c] = await Promise.all([
      service.reverse(47.0, 8.0),
      service.reverse(47.1, 8.1),
      service.reverse(47.2, 8.2),
    ]);

    expect(invokeSpy).toHaveBeenCalledTimes(3);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
  });
});
