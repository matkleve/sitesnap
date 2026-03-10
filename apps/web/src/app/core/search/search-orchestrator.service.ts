import { Injectable } from '@angular/core';
import {
    Observable,
    catchError,
    combineLatest,
    concat,
    debounceTime,
    distinctUntilChanged,
    map,
    of,
    shareReplay,
    switchMap,
    take,
    tap,
} from 'rxjs';
import {
    DEFAULT_SEARCH_ORCHESTRATOR_OPTIONS,
    SearchAddressCandidate,
    SearchCandidate,
    SearchCommandCandidate,
    SearchCommitAction,
    SearchContentCandidate,
    SearchOrchestratorOptions,
    SearchQueryContext,
    SearchRecentCandidate,
    SearchResultSet,
    SearchSection,
} from './search.models';

type DbAddressResolver = (
    query: string,
    context: SearchQueryContext,
) => Observable<SearchAddressCandidate[]>;

type DbContentResolver = (
    query: string,
    context: SearchQueryContext,
) => Observable<SearchContentCandidate[]>;

type GeocoderResolver = (
    query: string,
    context: SearchQueryContext,
) => Observable<SearchAddressCandidate[]>;

interface SearchSourceAdapters {
    dbAddressResolver?: DbAddressResolver;
    dbContentResolver?: DbContentResolver;
    geocoderResolver?: GeocoderResolver;
}

interface CachedResult {
    expiresAt: number;
    result: SearchResultSet;
}

@Injectable({ providedIn: 'root' })
export class SearchOrchestratorService {
    private readonly options: SearchOrchestratorOptions = {
        ...DEFAULT_SEARCH_ORCHESTRATOR_OPTIONS,
    };

    private readonly cache = new Map<string, CachedResult>();
    private readonly recentSearches: SearchRecentCandidate[] = [];
    private adapters: SearchSourceAdapters = {};

    configureSources(adapters: SearchSourceAdapters): void {
        this.adapters = { ...this.adapters, ...adapters };
    }

    configureOptions(overrides: Partial<SearchOrchestratorOptions>): void {
        Object.assign(this.options, overrides);
    }

    searchInput(
        query$: Observable<string>,
        context$: Observable<SearchQueryContext>,
    ): Observable<SearchResultSet> {
        return combineLatest([query$, context$]).pipe(
            debounceTime(this.options.debounceMs),
            distinctUntilChanged(
                ([prevQuery, prevContext], [nextQuery, nextContext]) =>
                    prevQuery === nextQuery && JSON.stringify(prevContext) === JSON.stringify(nextContext),
            ),
            switchMap(([query, context]) => this.searchSequence(query, context)),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
    }

    searchOnce(query: string, context: SearchQueryContext): Observable<SearchResultSet> {
        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
            return of(this.buildFocusedEmptyResult(query));
        }

        const cacheKey = this.buildCacheKey(trimmedQuery, context);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return of(cached.result);
        }

        const dbAddress$ = this.adapters.dbAddressResolver
            ? this.adapters.dbAddressResolver(trimmedQuery, context)
            : of([]);
        const dbContent$ = this.adapters.dbContentResolver
            ? this.adapters.dbContentResolver(trimmedQuery, context)
            : of([]);
        const geocoder$ = this.adapters.geocoderResolver
            ? this.adapters.geocoderResolver(trimmedQuery, context)
            : of([]);

        return combineLatest([dbAddress$, dbContent$, geocoder$]).pipe(
            map(([dbAddress, dbContent, geocoder]) => {
                const dedupedGeocoder = this.deduplicateGeocoderNearDb(dbAddress, geocoder);
                const sections = this.buildSections(trimmedQuery, context, dbAddress, dbContent, dedupedGeocoder);
                const result: SearchResultSet = {
                    query,
                    state: 'results-complete',
                    sections,
                    empty: sections.every((section) => section.items.length === 0),
                };

                this.cache.set(cacheKey, {
                    result,
                    expiresAt: Date.now() + this.options.cacheTtlMs,
                });
                return result;
            }),
        );
    }

    commit(candidate: SearchCandidate, query: string): SearchCommitAction {
        if (candidate.family === 'db-address' || candidate.family === 'geocoder') {
            return {
                type: 'map-center',
                query,
                lat: candidate.lat,
                lng: candidate.lng,
            };
        }

        if (candidate.family === 'db-content') {
            return {
                type: 'open-content',
                query,
                contentType: candidate.contentType,
                contentId: candidate.contentId,
            };
        }

        if (candidate.family === 'command') {
            return {
                type: 'run-command',
                query,
                command: candidate.command,
                payload: candidate.payload,
            };
        }

        return {
            type: 'recent-selected',
            query,
            label: candidate.label,
        };
    }

    addRecentSearch(label: string): void {
        const normalized = label.trim();
        if (!normalized) return;

        const now = new Date().toISOString();
        const existingIndex = this.recentSearches.findIndex(
            (item) => item.label.toLowerCase() === normalized.toLowerCase(),
        );

        if (existingIndex >= 0) {
            this.recentSearches.splice(existingIndex, 1);
        }

        this.recentSearches.unshift({
            id: `recent-${normalized.toLowerCase()}`,
            family: 'recent',
            label: normalized,
            lastUsedAt: now,
        });

        if (this.recentSearches.length > this.options.recentMaxItems) {
            this.recentSearches.length = this.options.recentMaxItems;
        }
    }

    getRecentSearches(limit = 5): SearchRecentCandidate[] {
        return this.recentSearches.slice(0, Math.max(0, limit));
    }

    private buildFocusedEmptyResult(query: string): SearchResultSet {
        const recentSection: SearchSection = {
            family: 'recent',
            title: 'Recent searches',
            items: this.getRecentSearches(5),
        };

        return {
            query,
            state: 'focused-empty',
            sections: [recentSection],
            empty: recentSection.items.length === 0,
        };
    }

    private buildSections(
        query: string,
        context: SearchQueryContext,
        dbAddress: SearchAddressCandidate[],
        dbContent: SearchContentCandidate[],
        geocoder: SearchAddressCandidate[],
        options?: { geocoderLoading?: boolean },
    ): SearchSection[] {
        const sections: SearchSection[] = [];

        const rankedDbAddress = [...dbAddress].sort((left, right) => {
            const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
            if (scoreDelta !== 0) return scoreDelta;
            return (right.imageCount ?? 0) - (left.imageCount ?? 0);
        });

        const rankedDbContent = [...dbContent].sort(
            (left, right) => (right.score ?? 0) - (left.score ?? 0),
        );

        const rankedGeocoder = [...geocoder].sort(
            (left, right) => (right.score ?? 0) - (left.score ?? 0),
        );

        sections.push({ family: 'db-address', title: 'Addresses', items: rankedDbAddress });
        sections.push({ family: 'db-content', title: 'Projects & Groups', items: rankedDbContent });
        sections.push({
            family: 'geocoder',
            title: 'Places',
            items: rankedGeocoder,
            loading: options?.geocoderLoading ?? false,
        });

        if (context.commandMode) {
            sections.push({
                family: 'command',
                title: 'Commands',
                items: this.buildCommandItems(query, context),
            });
        }

        return sections;
    }

    private buildCommandItems(
        query: string,
        context: SearchQueryContext,
    ): SearchCommandCandidate[] {
        const items: SearchCommandCandidate[] = [];
        const normalizedQuery = query.toLowerCase();

        const pushIfMatch = (
            id: string,
            label: string,
            command: SearchCommandCandidate['command'],
            payload?: string,
            visible = true,
        ) => {
            if (!visible) return;
            if (!normalizedQuery || label.toLowerCase().includes(normalizedQuery)) {
                items.push({ id, family: 'command', label, command, payload });
            }
        };

        pushIfMatch('cmd-upload', 'Upload photos', 'upload');
        pushIfMatch(
            'cmd-clear-filters',
            'Clear filters',
            'clear-filters',
            undefined,
            (context.activeFilterCount ?? 0) > 0,
        );
        pushIfMatch('cmd-go-location', 'Go to my location', 'go-to-location');

        return items;
    }

    private deduplicateGeocoderNearDb(
        dbAddress: SearchAddressCandidate[],
        geocoder: SearchAddressCandidate[],
    ): SearchAddressCandidate[] {
        if (dbAddress.length === 0 || geocoder.length === 0) return geocoder;

        return geocoder.filter((geoCandidate) => {
            return !dbAddress.some((dbCandidate) => {
                const meters = this.haversineMeters(
                    dbCandidate.lat,
                    dbCandidate.lng,
                    geoCandidate.lat,
                    geoCandidate.lng,
                );
                return meters <= this.options.geocoderDedupMeters;
            });
        });
    }

    private haversineMeters(
        leftLat: number,
        leftLng: number,
        rightLat: number,
        rightLng: number,
    ): number {
        const toRad = (degrees: number) => (degrees * Math.PI) / 180;
        const earthRadiusMeters = 6371000;

        const deltaLat = toRad(rightLat - leftLat);
        const deltaLng = toRad(rightLng - leftLng);
        const lat1 = toRad(leftLat);
        const lat2 = toRad(rightLat);

        const a =
            Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadiusMeters * c;
    }

    private buildCacheKey(query: string, context: SearchQueryContext): string {
        return `${query}::${JSON.stringify(context)}`;
    }

    private searchSequence(query: string, context: SearchQueryContext): Observable<SearchResultSet> {
        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
            return of(this.buildFocusedEmptyResult(query));
        }

        const cacheKey = this.buildCacheKey(trimmedQuery, context);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return of(cached.result);
        }

        const dbAddress$ = (this.adapters.dbAddressResolver
            ? this.adapters.dbAddressResolver(trimmedQuery, context)
            : of([])
        ).pipe(catchError(() => of([])), shareReplay({ bufferSize: 1, refCount: false }));

        const dbContent$ = (this.adapters.dbContentResolver
            ? this.adapters.dbContentResolver(trimmedQuery, context)
            : of([])
        ).pipe(catchError(() => of([])), shareReplay({ bufferSize: 1, refCount: false }));

        const geocoder$ = (this.adapters.geocoderResolver
            ? this.adapters.geocoderResolver(trimmedQuery, context)
            : of([])
        ).pipe(catchError(() => of([])), shareReplay({ bufferSize: 1, refCount: false }));

        const typingResult: SearchResultSet = {
            query,
            state: 'typing',
            sections: this.buildSections(trimmedQuery, context, [], [], [], { geocoderLoading: true }),
            empty: false,
        };

        const partial$ = combineLatest([dbAddress$, dbContent$]).pipe(
            take(1),
            map(([dbAddress, dbContent]) => ({
                query,
                state: 'results-partial' as const,
                sections: this.buildSections(trimmedQuery, context, dbAddress, dbContent, [], {
                    geocoderLoading: true,
                }),
                empty: false,
            })),
        );

        const complete$ = combineLatest([dbAddress$, dbContent$, geocoder$]).pipe(
            take(1),
            map(([dbAddress, dbContent, geocoder]) => {
                const dedupedGeocoder = this.deduplicateGeocoderNearDb(dbAddress, geocoder);
                const sections = this.buildSections(
                    trimmedQuery,
                    context,
                    dbAddress,
                    dbContent,
                    dedupedGeocoder,
                );

                return {
                    query,
                    state: 'results-complete' as const,
                    sections,
                    empty: sections.every((section) => section.items.length === 0),
                };
            }),
            tap((result) => {
                this.cache.set(cacheKey, {
                    result,
                    expiresAt: Date.now() + this.options.cacheTtlMs,
                });
            }),
        );

        return concat(of(typingResult), partial$, complete$);
    }
}
