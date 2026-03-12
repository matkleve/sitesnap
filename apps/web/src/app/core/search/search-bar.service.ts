import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, of } from 'rxjs';
import { SupabaseService } from '../supabase.service';
import {
  GeocodingService,
  GeocoderSearchOptions,
  GeocoderSearchResult,
} from '../geocoding.service';
import {
  SearchAddressCandidate,
  SearchContentCandidate,
  SearchQueryContext,
  SearchRecentCandidate,
} from './search.models';

const RECENT_SEARCHES_STORAGE_KEY = 'sitesnap-recent-searches';
const MAX_RECENT_SEARCHES = 20;
const MAX_DB_ADDRESS_ROWS = 24;
const MAX_DB_ADDRESS_RESULTS = 5;
const MAX_DB_CONTENT_RESULTS = 6;

interface DbAddressRow {
  id: string;
  address_label: string | null;
  street: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface DbContentRow {
  id: string;
  name: string | null;
}

@Injectable({ providedIn: 'root' })
export class SearchBarService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly geocodingService = inject(GeocodingService);

  // ── Recent Searches ──────────────────────────────────────────────────

  loadRecentSearches(): SearchRecentCandidate[] {
    const storage = this.getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item): item is SearchRecentCandidate =>
            typeof item === 'object' &&
            item !== null &&
            'label' in item &&
            typeof item.label === 'string',
        )
        .slice(0, MAX_RECENT_SEARCHES);
    } catch {
      return [];
    }
  }

  addRecentSearch(
    label: string,
    projectId?: string,
    existingRecents?: SearchRecentCandidate[],
  ): SearchRecentCandidate[] {
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return existingRecents ?? [];

    const item: SearchRecentCandidate = {
      id: `recent-${normalizedLabel.toLowerCase()}`,
      family: 'recent',
      label: normalizedLabel,
      lastUsedAt: new Date().toISOString(),
      projectId,
    };

    const recents = existingRecents ?? this.loadRecentSearches();
    const next = [
      item,
      ...recents.filter(
        (existing) => existing.label.toLowerCase() !== normalizedLabel.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT_SEARCHES);

    this.persistRecentSearches(next);
    return next;
  }

  getRecentSearches(
    limit: number,
    activeProjectId?: string,
    recents?: SearchRecentCandidate[],
  ): SearchRecentCandidate[] {
    const all = recents ?? this.loadRecentSearches();
    if (!activeProjectId) return all.slice(0, limit);

    const projectRecents = all.filter((r) => r.projectId === activeProjectId);
    const otherRecents = all.filter((r) => r.projectId !== activeProjectId);
    return [...projectRecents, ...otherRecents].slice(0, limit);
  }

  // ── DB Address Resolution ────────────────────────────────────────────

  resolveDbAddresses(
    query: string,
    _context: SearchQueryContext,
  ): Observable<SearchAddressCandidate[]> {
    return from(this.fetchDbAddressCandidates(query)).pipe(catchError(() => of([])));
  }

  // ── DB Content Resolution ────────────────────────────────────────────

  resolveDbContent(
    query: string,
    _context: SearchQueryContext,
  ): Observable<SearchContentCandidate[]> {
    return from(this.fetchDbContentCandidates(query)).pipe(catchError(() => of([])));
  }

  // ── Geocoder Resolution ──────────────────────────────────────────────

  resolveGeocoder(
    query: string,
    context: SearchQueryContext,
  ): Observable<SearchAddressCandidate[]> {
    const normalizedQuery = this.normalizeSearchQuery(query);
    if (!normalizedQuery) return of([]);

    return from(this.fetchGeocoderCandidates(normalizedQuery, context)).pipe(
      catchError(() => of([])),
    );
  }

  // ── Address Formatting ───────────────────────────────────────────────

  formatAddressLabel(result: GeocoderSearchResult): string {
    const addr = result.address;
    if (!addr) return this.truncateDisplayName(result.displayName);

    const city = addr.city || addr.town || addr.village || addr.municipality;
    const parts = this.buildAddressParts(addr.road, addr.house_number, addr.postcode, city);
    return parts || this.truncateDisplayName(result.displayName);
  }

  private buildAddressParts(
    street?: string,
    number?: string,
    postcode?: string,
    city?: string,
  ): string | null {
    const streetPart = street ? (number ? `${street} ${number}` : street) : null;
    const cityPart = postcode && city ? `${postcode} ${city}` : city || null;

    if (streetPart && cityPart) return `${streetPart}, ${cityPart}`;
    if (streetPart) return streetPart;
    return cityPart;
  }

  // ── Query Normalization ──────────────────────────────────────────────

  normalizeSearchQuery(query: string): string {
    return this.applyStreetTokenCorrections(
      query
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  buildFallbackQueries(normalizedQuery: string): string[] {
    const candidates = new Set<string>();
    const correctedFull = this.applyStreetTokenCorrections(normalizedQuery);
    this.addIfDistinct(candidates, correctedFull, normalizedQuery);

    const base = correctedFull || normalizedQuery;
    const streetOnly = base.replace(/\s+\d+[a-zA-Z]?\s*$/, '').trim();
    this.addIfDistinct(candidates, streetOnly, normalizedQuery, correctedFull);

    const correctedStreetOnly = this.applyStreetTokenCorrections(streetOnly);
    this.addIfDistinct(candidates, correctedStreetOnly, normalizedQuery, correctedFull, streetOnly);

    return [...candidates];
  }

  private addIfDistinct(set: Set<string>, value: string, ...exclude: string[]): void {
    if (value && !exclude.includes(value)) set.add(value);
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async fetchDbAddressCandidates(query: string): Promise<SearchAddressCandidate[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const response = await this.supabaseService.client
      .from('images')
      .select('id,address_label,street,city,latitude,longitude')
      .ilike('address_label', `%${trimmedQuery}%`)
      .not('address_label', 'is', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(MAX_DB_ADDRESS_ROWS);

    if (response.error || !Array.isArray(response.data)) return [];

    const grouped = new Map<
      string,
      {
        label: string;
        ids: string[];
        latTotal: number;
        lngTotal: number;
        count: number;
        score: number;
      }
    >();

    for (const row of response.data as DbAddressRow[]) {
      const rawLabel = row.address_label?.trim();
      const lat = this.toNumber(row.latitude);
      const lng = this.toNumber(row.longitude);
      if (!rawLabel || lat === null || lng === null) continue;

      // Reformat legacy verbose labels using structured columns
      const label = this.formatDbAddressLabel(rawLabel, row.street, row.city);

      const key = label.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.ids.push(row.id);
        existing.latTotal += lat;
        existing.lngTotal += lng;
        existing.count += 1;
        existing.score = Math.max(existing.score, this.computeScore(label, trimmedQuery));
        continue;
      }

      grouped.set(key, {
        label,
        ids: [row.id],
        latTotal: lat,
        lngTotal: lng,
        count: 1,
        score: this.computeScore(label, trimmedQuery),
      });
    }

    return [...grouped.values()]
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) return scoreDelta;
        return right.count - left.count;
      })
      .slice(0, MAX_DB_ADDRESS_RESULTS)
      .map((entry, index) => ({
        id: entry.ids[0] ?? `db-address-${index}`,
        family: 'db-address' as const,
        label: entry.label,
        lat: entry.latTotal / entry.count,
        lng: entry.lngTotal / entry.count,
        imageCount: entry.count,
        score: entry.score,
      }));
  }

  private async fetchDbContentCandidates(query: string): Promise<SearchContentCandidate[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const [projectsResponse, groupsResponse] = await Promise.all([
      this.supabaseService.client
        .from('projects')
        .select('id,name')
        .ilike('name', `%${trimmedQuery}%`)
        .limit(MAX_DB_CONTENT_RESULTS),
      this.supabaseService.client
        .from('saved_groups')
        .select('id,name')
        .ilike('name', `%${trimmedQuery}%`)
        .limit(MAX_DB_CONTENT_RESULTS),
    ]);

    const projectCandidates = (
      projectsResponse.error || !Array.isArray(projectsResponse.data)
        ? []
        : (projectsResponse.data as DbContentRow[])
            .filter((row) => !!row.name)
            .map((row) => ({
              id: `project-${row.id}`,
              family: 'db-content' as const,
              label: row.name?.trim() ?? '',
              contentType: 'project' as const,
              contentId: row.id,
              subtitle: 'Project',
              score: this.computeScore(row.name ?? '', trimmedQuery),
            }))
    ).filter((candidate) => candidate.label.length > 0);

    const groupCandidates = (
      groupsResponse.error || !Array.isArray(groupsResponse.data)
        ? []
        : (groupsResponse.data as DbContentRow[])
            .filter((row) => !!row.name)
            .map((row) => ({
              id: `group-${row.id}`,
              family: 'db-content' as const,
              label: row.name?.trim() ?? '',
              contentType: 'group' as const,
              contentId: row.id,
              subtitle: 'Saved group',
              score: this.computeScore(row.name ?? '', trimmedQuery),
            }))
    ).filter((candidate) => candidate.label.length > 0);

    return [...projectCandidates, ...groupCandidates]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, MAX_DB_CONTENT_RESULTS);
  }

  private async fetchGeocoderCandidates(
    normalizedQuery: string,
    context: SearchQueryContext,
  ): Promise<SearchAddressCandidate[]> {
    const searchOptions: GeocoderSearchOptions = { limit: 5 };
    if (context.countryCodes?.length) {
      searchOptions.countrycodes = context.countryCodes;
    }
    if (context.viewportBounds) {
      const b = context.viewportBounds;
      searchOptions.viewbox = `${b.west},${b.north},${b.east},${b.south}`;
    }

    const queries = [normalizedQuery, ...this.buildFallbackQueries(normalizedQuery)];
    for (const currentQuery of queries) {
      const results = await this.geocodingService.search(currentQuery, searchOptions);
      if (results.length > 0) {
        return results.map((result, index) =>
          this.toGeocoderCandidate(result, currentQuery, index),
        );
      }
    }

    return [];
  }

  private toGeocoderCandidate(
    result: GeocoderSearchResult,
    query: string,
    index: number,
  ): SearchAddressCandidate {
    const formatted = this.formatAddressLabel(result);
    const isPoi =
      result.name != null && result.address?.road != null && result.name !== result.address.road;

    return {
      id: `geo-${query}-${index}`,
      family: 'geocoder',
      label: isPoi ? result.name! : formatted,
      secondaryLabel: isPoi ? formatted : undefined,
      lat: result.lat,
      lng: result.lng,
      score: result.importance,
    };
  }

  private persistRecentSearches(recents: SearchRecentCandidate[]): void {
    const storage = this.getStorage();
    if (!storage) return;
    try {
      storage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recents));
    } catch {
      // Ignore storage failures — keep in-memory recents.
    }
  }

  private getStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
  }

  private computeScore(label: string, query: string): number {
    const normalizedLabel = label.trim().toLowerCase();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedLabel || !normalizedQuery) return 0;

    if (normalizedLabel === normalizedQuery) return 1;
    if (normalizedLabel.startsWith(normalizedQuery)) return 0.92;
    if (normalizedLabel.includes(normalizedQuery)) return 0.8;

    const sharedTokens = normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => normalizedLabel.includes(token)).length;

    return Math.min(0.79, sharedTokens * 0.2);
  }

  /**
   * Reformat a DB address label using structured street/city columns.
   * Legacy rows store verbose Nominatim display_name; structured columns
   * let us rebuild a clean "Street, City" label.
   */
  private formatDbAddressLabel(
    rawLabel: string,
    street: string | null,
    city: string | null,
  ): string {
    if (street && city) return `${street}, ${city}`;
    if (street) return street;
    if (city) return city;
    return rawLabel;
  }

  private toNumber(value: number | string | null): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private truncateDisplayName(displayName: string): string {
    return displayName.length > 60 ? displayName.slice(0, 60) + '…' : displayName;
  }

  private applyStreetTokenCorrections(query: string): string {
    return query
      .split(' ')
      .map((token) => this.correctStreetToken(token))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private correctStreetToken(token: string): string {
    if (!token) return token;

    // Exact-match abbreviations
    if (token === 'g' || token === 'g.') return 'gasse';
    if (token === 'str' || token === 'str.') return 'strasse';

    // Suffix-based corrections (order matters: longest suffix first)
    const suffixReplacements: [string, string][] = [
      ['strassee', 'strasse'],
      ['strase', 'strasse'],
      ['stras', 'strasse'],
      ['str.', 'strasse'],
      ['str', 'strasse'],
      ['gase', 'gasse'],
      ['gass', 'gasse'],
      ['gas', 'gasse'],
    ];

    for (const [suffix, replacement] of suffixReplacements) {
      if (token.endsWith(suffix)) {
        return token.slice(0, -suffix.length) + replacement;
      }
    }
    return token;
  }
}
