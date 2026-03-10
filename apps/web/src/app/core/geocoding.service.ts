/**
 * GeocodingService — reverse-geocodes coordinates to structured address data
 * via the Nominatim (OpenStreetMap) API.
 *
 * Ground rules:
 *  - Rate-limited to 1 request per second (Nominatim usage policy).
 *  - Never throws — returns null on failure.
 *  - Results are cached in-memory (5-minute TTL) to avoid redundant requests.
 *  - Used by UploadService to populate address fields after image insertion.
 */

import { Injectable } from '@angular/core';

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

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100; // slightly above 1s to respect Nominatim rate limit

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly reverseCache = new Map<
    string,
    { data: ReverseGeocodeResult; expires: number }
  >();
  private readonly forwardCache = new Map<
    string,
    { data: ForwardGeocodeResult; expires: number }
  >();
  private lastRequestTime = 0;

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

    await this.rateLimit();

    try {
      this.lastRequestTime = Date.now();

      const url = `${NOMINATIM_REVERSE_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&addressdetails=1`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as NominatimReverseResponse;
      if (!data?.address) return null;

      const result = this.parseReverseResponse(data);

      this.reverseCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
      return result;
    } catch {
      return null;
    }
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

    await this.rateLimit();

    try {
      this.lastRequestTime = Date.now();

      const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(trimmed)}&format=json&limit=1&addressdetails=1`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
      });

      if (!response.ok) return null;

      const results = (await response.json()) as NominatimSearchResponse[];
      if (!results?.length || !results[0].lat || !results[0].lon) return null;

      const hit = results[0];
      const lat = parseFloat(hit.lat!);
      const lng = parseFloat(hit.lon!);
      if (isNaN(lat) || isNaN(lng)) return null;

      const addr = hit.address;
      const city = this.firstOf(addr?.city, addr?.town, addr?.village, addr?.municipality);
      const district = this.firstOf(
        addr?.city_district,
        addr?.suburb,
        addr?.borough,
        addr?.quarter,
      );
      const streetParts = [addr?.road, addr?.house_number].filter(Boolean);
      const street = streetParts.length > 0 ? streetParts.join(' ') : null;
      const country = addr?.country ?? null;
      const addressLabel = hit.display_name ?? [street, city, country].filter(Boolean).join(', ');

      const result: ForwardGeocodeResult = {
        lat,
        lng,
        addressLabel,
        city,
        district,
        street,
        country,
      };
      this.forwardCache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL_MS });
      return result;
    } catch {
      return null;
    }
  }

  /** Wait to respect Nominatim 1-request-per-second rate limit. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
  }

  private parseReverseResponse(data: NominatimReverseResponse): ReverseGeocodeResult {
    const addr = data.address!;

    const city = this.firstOf(addr.city, addr.town, addr.village, addr.municipality);
    const district = this.firstOf(addr.city_district, addr.suburb, addr.borough, addr.quarter);

    const streetParts = [addr.road, addr.house_number].filter(Boolean);
    const street = streetParts.length > 0 ? streetParts.join(' ') : null;

    const country = addr.country ?? null;
    const addressLabel = data.display_name ?? [street, city, country].filter(Boolean).join(', ');

    return { addressLabel, city, district, street, country };
  }

  /** Returns the first non-nullish value, or null. */
  private firstOf(...values: (string | undefined | null)[]): string | null {
    return values.find((v) => v != null) ?? null;
  }
}
