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
import { detectCoordinates, type DetectedCoordinates } from './coordinate-detection';
import { GhostTrie, type GhostTrieEntry } from './ghost-trie';
import {
  computeTextMatchScore,
  formatGeocoderAddressLabel,
  formatDbAddressLabel,
  normalizeSearchQuery,
  buildFallbackQueries,
  toNumber,
} from './search-query';

export type { DetectedCoordinates } from './coordinate-detection';
export type { GhostTrieEntry } from './ghost-trie';

const RECENT_SEARCHES_STORAGE_KEY = 'feldpost-recent-searches';
const MAX_RECENT_SEARCHES = 20;
const MAX_DB_ADDRESS_ROWS = 24;
const MAX_DB_ADDRESS_RESULTS = 5;
const MAX_DB_CONTENT_RESULTS = 6;
const MAX_GEOCODER_RESULTS = 3;

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

interface AddressGroup {
  label: string;
  ids: string[];
  latTotal: number;
  lngTotal: number;
  count: number;
  score: number;
}

@Injectable({ providedIn: 'root' })
export class SearchBarService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly geocodingService = inject(GeocodingService);

  private readonly ghostTrie = new GhostTrie();

  // ── Coordinate Detection ─────────────────────────────────────────────

  detectCoordinates(input: string): DetectedCoordinates | null {
    return detectCoordinates(input);
  }

  // ── Ghost Completion ─────────────────────────────────────────────────

  buildGhostTrie(entries: GhostTrieEntry[]): void {
    this.ghostTrie.build(entries);
  }

  queryGhostCompletion(input: string): string | null {
    return this.ghostTrie.query(input);
  }

  // ── Recent Searches ──────────────────────────────────────────────────

  loadRecentSearches(): SearchRecentCandidate[] {
    const storage = this.getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];

      const recents = parsed
        .filter(
          (item): item is SearchRecentCandidate =>
            typeof item === 'object' &&
            item !== null &&
            'label' in item &&
            typeof item.label === 'string',
        )
        .map((item) => ({ ...item, label: sanitizeRecentLabel(item.label) }))
        .filter((item) => item.label.length > 0)
        .slice(0, MAX_RECENT_SEARCHES);

      return recents;
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

  formatAddressLabel = formatGeocoderAddressLabel;

  // ── Query Normalization ──────────────────────────────────────────────

  normalizeSearchQuery = normalizeSearchQuery;

  buildFallbackQueries = buildFallbackQueries;

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

    const grouped = this.groupAddressRows(response.data as DbAddressRow[], trimmedQuery);

    return this.rankedAddressCandidates(grouped);
  }

  private groupAddressRows(rows: DbAddressRow[], trimmedQuery: string): Map<string, AddressGroup> {
    const grouped = new Map<string, AddressGroup>();

    for (const row of rows) {
      const rawLabel = row.address_label?.trim();
      const lat = toNumber(row.latitude);
      const lng = toNumber(row.longitude);
      if (!rawLabel || lat === null || lng === null) continue;

      const label = formatDbAddressLabel(rawLabel, row.street, row.city);
      const key = label.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.ids.push(row.id);
        existing.latTotal += lat;
        existing.lngTotal += lng;
        existing.count += 1;
        existing.score = Math.max(existing.score, computeTextMatchScore(label, trimmedQuery));
        continue;
      }

      grouped.set(key, {
        label,
        ids: [row.id],
        latTotal: lat,
        lngTotal: lng,
        count: 1,
        score: computeTextMatchScore(label, trimmedQuery),
      });
    }

    return grouped;
  }

  private rankedAddressCandidates(grouped: Map<string, AddressGroup>): SearchAddressCandidate[] {
    // Apply dataGravity: textMatch × log2(imageCount + 1)
    for (const entry of grouped.values()) {
      entry.score = entry.score * Math.log2(entry.count + 1);
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
              score: computeTextMatchScore(row.name ?? '', trimmedQuery),
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
              score: computeTextMatchScore(row.name ?? '', trimmedQuery),
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
    // Require at least 3 characters to avoid noise (e.g. "De" → Germany)
    if (normalizedQuery.length < 3) return [];

    const searchOptions: GeocoderSearchOptions = { limit: MAX_GEOCODER_RESULTS };
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
        return results
          .filter((r) => isStreetLevelResult(r))
          .slice(0, MAX_GEOCODER_RESULTS)
          .map((result, index) => this.toGeocoderCandidate(result, currentQuery, index));
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
}

/**
 * Clean up raw Nominatim display_name entries (e.g.
 * "Wohngesund, 6, Schönbrunner Allee, Vösendorf, Bezirk Mödling, Lower Austria, Austria")
 * by keeping only the first 3 meaningful parts.
 */
function sanitizeRecentLabel(label: string): string {
  const parts = label
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 3) return label.trim();
  return parts.slice(0, 3).join(', ');
}

/**
 * Filter out country/state-level results that aren't useful for a construction app.
 * Keeps results that have at least a city OR a road in their address.
 */
function isStreetLevelResult(result: GeocoderSearchResult): boolean {
  const addr = result.address;
  if (!addr) return true; // Keep results with no address (can't filter)
  const hasCity = !!(addr.city || addr.town || addr.village || addr.municipality);
  const hasRoad = !!addr.road;
  return hasCity || hasRoad;
}
