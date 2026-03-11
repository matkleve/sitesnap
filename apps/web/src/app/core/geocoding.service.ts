/**
 * GeocodingService — reverse-geocodes coordinates to structured address data
 * via the `geocode` Supabase Edge Function (which proxies Nominatim).
 *
 * Ground rules:
 *  - Requests are routed through a server-side proxy to eliminate browser CORS
 *    issues and enforce rate limiting centrally.
 *  - Never throws — returns null on failure.
 *  - Results are cached in-memory (5-minute TTL) to avoid redundant requests.
 *  - A serial queue ensures only one in-flight request at a time, preventing
 *    concurrent calls from bypassing the rate limit.
 *  - Used by LocationResolverService, UploadService, and PlacementMode.
 */

import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Structured address fields extracted from a Nominatim reverse-geocode response. */
export interface ReverseGeocodeResult {
  addressLabel: string;
  city: string | null;
  district: string | null;
  street: string | null;
  country: string | null;
}

/** Raw Nominatim reverse-geocode JSON shape (subset we use). */
interface NominatimReverseResponse {
  display_name?: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    city_district?: string;
    suburb?: string;
    borough?: string;
    quarter?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

/** Structured result from forward geocoding (address string → coordinates). */
export interface ForwardGeocodeResult {
  lat: number;
  lng: number;
  addressLabel: string;
  city: string | null;
  district: string | null;
  street: string | null;
  country: string | null;
}

/** Raw Nominatim forward-search JSON shape (subset we use). */
interface NominatimSearchResponse {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimReverseResponse['address'];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly supabase = inject(SupabaseService);

  private readonly reverseCache = new Map<
    string,
    { data: ReverseGeocodeResult; expires: number }
  >();
  private readonly forwardCache = new Map<
    string,
    { data: ForwardGeocodeResult; expires: number }
  >();

  /**
   * Serial queue: chains every request so only one is in-flight at a time.
   * This prevents concurrent callers from racing past the server-side rate limit.
   */
  private queue: Promise<void> = Promise.resolve();

  /**
   * Reverse-geocode a lat/lng pair to structured address fields.
   * Returns null when the geocoder cannot resolve the location or on network error.
   */
  async reverse(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const cached = this.reverseCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    return this.enqueue(async () => {
      // Re-check cache after waiting in queue (another request may have resolved it).
      const freshCached = this.reverseCache.get(cacheKey);
      if (freshCached && freshCached.expires > Date.now()) {
        return freshCached.data;
      }

      try {
        const data = await this.callProxy<NominatimReverseResponse>({
          action: 'reverse',
          lat,
          lng,
        });
        if (!data?.address) return null;

        const result = this.parseReverseResponse(data);
        this.reverseCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
        return result;
      } catch {
        return null;
      }
    });
  }

  /**
   * Forward-geocode an address string to coordinates + structured address fields.
   * Returns null when the geocoder cannot resolve the address or on network error.
   */
  async forward(address: string): Promise<ForwardGeocodeResult | null> {
    const trimmed = address.trim();
    if (!trimmed) return null;

    const cacheKey = trimmed.toLowerCase();
    const cached = this.forwardCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    return this.enqueue(async () => {
      const freshCached = this.forwardCache.get(cacheKey);
      if (freshCached && freshCached.expires > Date.now()) {
        return freshCached.data;
      }

      try {
        const results = await this.callProxy<NominatimSearchResponse[]>({
          action: 'forward',
          q: trimmed,
        });
        if (!results?.length || !results[0].lat || !results[0].lon) return null;

        const result = this.parseForwardResponse(results[0]);
        if (!result) return null;

        this.forwardCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
        return result;
      } catch {
        return null;
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Enqueue a request so only one runs at a time.
   * Each call chains onto `this.queue`, preventing concurrent Nominatim hits.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    // Keep the queue moving regardless of success/failure
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  /** Call the `geocode` Supabase Edge Function. */
  private async callProxy<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.client.functions.invoke('geocode', {
      body,
    });
    if (error) throw error;
    return data as T;
  }

  private parseReverseResponse(data: NominatimReverseResponse): ReverseGeocodeResult {
    const { city, district, street, country } = this.extractAddressFields(data.address!);
    const addressLabel = data.display_name ?? [street, city, country].filter(Boolean).join(', ');
    return { addressLabel, city, district, street, country };
  }

  private parseForwardResponse(hit: NominatimSearchResponse): ForwardGeocodeResult | null {
    const lat = parseFloat(hit.lat!);
    const lng = parseFloat(hit.lon!);
    if (isNaN(lat) || isNaN(lng)) return null;

    const { city, district, street, country } = this.extractAddressFields(hit.address);
    const addressLabel = hit.display_name ?? [street, city, country].filter(Boolean).join(', ');
    return { lat, lng, addressLabel, city, district, street, country };
  }

  /** Extract structured address fields from a Nominatim address object. */
  private extractAddressFields(addr?: NominatimReverseResponse['address']): {
    city: string | null;
    district: string | null;
    street: string | null;
    country: string | null;
  } {
    if (!addr) return { city: null, district: null, street: null, country: null };

    const city = this.firstOf(addr.city, addr.town, addr.village, addr.municipality);
    const district = this.firstOf(addr.city_district, addr.suburb, addr.borough, addr.quarter);
    const streetParts = [addr.road, addr.house_number].filter(Boolean);

    return {
      city,
      district,
      street: streetParts.length > 0 ? streetParts.join(' ') : null,
      country: addr.country ?? null,
    };
  }

  /** Returns the first non-nullish value, or null. */
  private firstOf(...values: (string | undefined | null)[]): string | null {
    return values.find((v) => v != null) ?? null;
  }
}
