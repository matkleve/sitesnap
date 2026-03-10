import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, toArray } from 'rxjs';
import { SearchOrchestratorService } from './search-orchestrator.service';

describe('SearchOrchestratorService', () => {
    function setup() {
        TestBed.configureTestingModule({ providers: [SearchOrchestratorService] });
        const service = TestBed.inject(SearchOrchestratorService);
        return { service };
    }

    it('returns focused-empty state for empty query', async () => {
        const { service } = setup();

        const result = await firstValueFrom(service.searchOnce('  ', {}));

        expect(result?.state).toBe('focused-empty');
    });

    it('keeps DB-first sections order and deduplicates nearby geocoder candidates', async () => {
        const { service } = setup();

        service.configureSources({
            dbAddressResolver: () =>
                of([
                    {
                        id: 'db-1',
                        label: 'Burgstrasse 7',
                        family: 'db-address',
                        lat: 47.3769,
                        lng: 8.5417,
                        imageCount: 12,
                        score: 0.9,
                    },
                ]),
            dbContentResolver: () =>
                of([
                    {
                        id: 'group-1',
                        label: 'Burg quote group',
                        family: 'db-content',
                        contentType: 'group',
                        contentId: 'group-1',
                        score: 0.7,
                    },
                ]),
            geocoderResolver: () =>
                of([
                    {
                        id: 'geo-near',
                        label: 'Burgstrasse 7, Zurich',
                        family: 'geocoder',
                        lat: 47.3769001,
                        lng: 8.5417001,
                        score: 0.8,
                    },
                    {
                        id: 'geo-far',
                        label: 'Burgstrasse 7, Bern',
                        family: 'geocoder',
                        lat: 46.9479,
                        lng: 7.4446,
                        score: 0.6,
                    },
                ]),
        });

        const result = await firstValueFrom(service.searchOnce('burg', {}));
        const families = result?.sections.map((section) => section.family);

        expect(families?.slice(0, 3)).toEqual(['db-address', 'db-content', 'geocoder']);

        const geocoderSection = result?.sections.find((section) => section.family === 'geocoder');
        expect(geocoderSection?.items.length).toBe(1);
        expect(geocoderSection?.items[0].id).toBe('geo-far');
    });

    it('stores and returns recent searches as deduplicated MRU', () => {
        const { service } = setup();

        service.addRecentSearch('Zurich');
        service.addRecentSearch('Bern');
        service.addRecentSearch('zurich');

        const recent = service.getRecentSearches(5);

        expect(recent.length).toBe(2);
        expect(recent[0].label).toBe('zurich');
        expect(recent[1].label).toBe('Bern');
    });

    it('emits typing, partial, and complete states for non-empty queries', async () => {
        const { service } = setup();

        service.configureSources({
            dbAddressResolver: () =>
                of([
                    {
                        id: 'db-1',
                        label: 'Burgstrasse 7',
                        family: 'db-address',
                        lat: 47.3769,
                        lng: 8.5417,
                        imageCount: 12,
                        score: 0.9,
                    },
                ]),
            dbContentResolver: () => of([]),
            geocoderResolver: () => of([]),
        });

        const states = await firstValueFrom(service.searchInput(of('burg'), of({})).pipe(toArray()));

        expect(states.map((state) => state.state)).toEqual([
            'typing',
            'results-partial',
            'results-complete',
        ]);
        expect(states[1].sections.find((section) => section.family === 'geocoder')?.loading).toBe(true);
    });
});
