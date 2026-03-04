/**
 * MapShellComponent unit tests.
 *
 * Strategy:
 *  - Leaflet is NOT initialised in tests (afterNextRender doesn't fire in jsdom).
 *  - UploadService, AuthService, and SupabaseService are faked.
 *  - All existing tests preserved + new tests for GPS, search, photo panel.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MapShellComponent } from './map-shell.component';
import { UploadService } from '../../../core/upload.service';
import { AuthService } from '../../../core/auth.service';
import { SupabaseService } from '../../../core/supabase.service';

function createJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function buildTestBed() {
    return TestBed.configureTestingModule({
        imports: [MapShellComponent],
        providers: [
            {
                provide: UploadService,
                useValue: {
                    validateFile: vi.fn().mockReturnValue({ valid: true }),
                    parseExif: vi.fn().mockResolvedValue({}),
                    uploadFile: vi.fn().mockResolvedValue({ error: 'not called in tests' }),
                },
            },
            {
                provide: AuthService,
                useValue: {
                    user: vi.fn().mockReturnValue(null),
                    session: { set: vi.fn() },
                    loading: { set: vi.fn() },
                    initialize: vi.fn().mockResolvedValue(undefined),
                },
            },
            {
                provide: SupabaseService,
                useValue: {
                    client: {
                        auth: {
                            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
                            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
                        },
                        from: vi.fn(),
                        storage: { from: vi.fn() },
                    },
                },
            },
            { provide: Router, useValue: { navigate: vi.fn() } },
        ],
    }).compileComponents();
}

describe('MapShellComponent', () => {
    beforeEach(async () => {
        localStorage.clear();
        await buildTestBed();
    });

    // ── Basic structure ────────────────────────────────────────────────────────

    it('creates', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the floating search bar', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const bar = (fixture.nativeElement as HTMLElement).querySelector('.map-search-bar');
        expect(bar).not.toBeNull();
    });

    it('renders the map container element', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const container = (fixture.nativeElement as HTMLElement).querySelector('.map-container');
        expect(container).not.toBeNull();
    });

    it('renders the floating upload button', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const btn = (fixture.nativeElement as HTMLElement).querySelector('.map-upload-btn');
        expect(btn).not.toBeNull();
        expect((btn as HTMLButtonElement)?.getAttribute('aria-label')).toBe('Upload images');
    });

    // ── Upload panel state ─────────────────────────────────────────────────────

    it('upload panel is not visible by default', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(false);
    });

    it('toggleUploadPanel() makes the panel visible', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();

        expect(fixture.componentInstance.uploadPanelOpen()).toBe(true);
    });

    it('toggleUploadPanel() hides the panel when called twice', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();
        fixture.componentInstance.toggleUploadPanel();

        expect(fixture.componentInstance.uploadPanelOpen()).toBe(false);
    });

    it('upload panel stays open until explicitly toggled closed', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(true);

        fixture.componentInstance.toggleUploadPanel();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(false);

        fixture.componentInstance.toggleUploadPanel();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(true);
    });

    it('renders the app-upload-panel element', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const panel = (fixture.nativeElement as HTMLElement).querySelector('app-upload-panel');
        expect(panel).not.toBeNull();
    });

    // ── Placement mode ─────────────────────────────────────────────────────────

    it('enterPlacementMode sets placementActive to true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.enterPlacementMode('test-key');

        expect(fixture.componentInstance.placementActive()).toBe(true);
    });

    it('cancelPlacement resets placementActive to false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.enterPlacementMode('test-key');
        fixture.componentInstance.cancelPlacement();

        expect(fixture.componentInstance.placementActive()).toBe(false);
    });

    it('shows placement banner when placementActive is true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.enterPlacementMode('test-key');
        fixture.detectChanges();

        const banner = (fixture.nativeElement as HTMLElement).querySelector('.map-placement-banner');
        expect(banner).not.toBeNull();
        expect(banner?.textContent).toContain('Click the map to place the image');
    });

    it('hides placement banner when placementActive is false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const banner = (fixture.nativeElement as HTMLElement).querySelector('.map-placement-banner');
        expect(banner).toBeNull();
    });

    // ── GPS button ─────────────────────────────────────────────────────────────

    it('renders the GPS button', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const btn = (fixture.nativeElement as HTMLElement).querySelector('.map-gps-btn');
        expect(btn).not.toBeNull();
        expect((btn as HTMLButtonElement).getAttribute('aria-label')).toBe('Go to my location');
    });

    it('gpsLocating signal defaults to false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.gpsLocating()).toBe(false);
    });

    it('userPosition signal defaults to null', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.userPosition()).toBeNull();
    });

    it('goToUserPosition() does not throw when map is undefined', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        expect(() => fixture.componentInstance.goToUserPosition()).not.toThrow();
    });

    it('GPS button shows spinner while locating', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.gpsLocating.set(true);
        fixture.detectChanges();

        const spinner = (fixture.nativeElement as HTMLElement).querySelector('.map-gps-btn__spinner');
        expect(spinner).not.toBeNull();
    });

    it('goToUserPosition() requests current position when unknown', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            addLayer: vi.fn(),
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(13),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;

        const originalGeolocation = navigator.geolocation;
        const getCurrentPosition = vi.fn((success: PositionCallback) => {
            success({
                coords: {
                    latitude: 48.2,
                    longitude: 16.37,
                },
            } as GeolocationPosition);
        });

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition,
            },
        });

        fixture.componentInstance.goToUserPosition();
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(mapStub.setView).toHaveBeenCalledWith([48.2, 16.37], 15);
        expect(fixture.componentInstance.gpsLocating()).toBe(false);
        expect(fixture.componentInstance.userPosition()).toEqual([48.2, 16.37]);

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: originalGeolocation,
        });
    });

    it('goToUserPosition() recenters immediately when userPosition is already known', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            addLayer: vi.fn(),
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(12),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;
        fixture.componentInstance.userPosition.set([51.5, -0.12]);

        const originalGeolocation = navigator.geolocation;
        const getCurrentPosition = vi.fn();

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition,
            },
        });

        fixture.componentInstance.goToUserPosition();

        expect(mapStub.setView).toHaveBeenCalledWith([51.5, -0.12], 15);
        expect(fixture.componentInstance.gpsLocating()).toBe(false);
        expect(getCurrentPosition).not.toHaveBeenCalled();

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: originalGeolocation,
        });
    });

    // ── Search bar ─────────────────────────────────────────────────────────────

    it('searchQuery signal defaults to empty string', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.searchQuery()).toBe('');
    });

    it('dropdownOpen signal defaults to false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.dropdownOpen()).toBe(false);
    });

    it('onSearchFocus() opens the dropdown', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.componentInstance.onSearchFocus();
        expect(fixture.componentInstance.dropdownOpen()).toBe(true);
    });

    it('onSearchInput() updates searchQuery signal', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const input = Object.assign(document.createElement('input'), { value: 'Vienna' });
        fixture.componentInstance.onSearchInput({ target: input } as unknown as Event);
        expect(fixture.componentInstance.searchQuery()).toBe('Vienna');
    });

    it('normalizes street token variants before geocoder request (Denisgass -> denisgasse)', async () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(createJsonResponse([]));

        await (fixture.componentInstance as unknown as { fetchNominatim: (query: string) => Promise<void> }).fetchNominatim(
            'Denisgass 46',
        );

        const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
        expect(calledUrl).toContain('q=denisgasse%2046');

        fetchSpy.mockRestore();
    });

    it('normalizes multiple common typo variants (gase/str/strase)', async () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createJsonResponse([]));

        const firstRequestUrlFor = async (input: string): Promise<string> => {
            const before = fetchSpy.mock.calls.length;
            await (
                fixture.componentInstance as unknown as {
                    fetchNominatim: (query: string) => Promise<void>;
                }
            ).fetchNominatim(input);
            return String(fetchSpy.mock.calls[before]?.[0] ?? '');
        };

        expect(await firstRequestUrlFor('Denisgase 46')).toContain('q=denisgasse%2046');
        expect(await firstRequestUrlFor('Hauptstr 12')).toContain('q=hauptstrasse%2012');
        expect(await firstRequestUrlFor('Burgstrase 7')).toContain('q=burgstrasse%207');

        fetchSpy.mockRestore();
    });

    it('shows a suggestion when strict query misses and fallback street-only query returns results', async () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const fallbackResult = {
            lat: '48.2082',
            lon: '16.3738',
            display_name: 'Denisgasse, Wien, Austria',
            address: {
                road: 'Denisgasse',
                city: 'Wien',
                country: 'Austria',
            },
        };

        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(createJsonResponse([]))
            .mockResolvedValueOnce(createJsonResponse([fallbackResult]));

        await (fixture.componentInstance as unknown as { fetchNominatim: (query: string) => Promise<void> }).fetchNominatim(
            'Denisgasse 46',
        );

        expect(fixture.componentInstance.searchSuggestion()).toBe('Denisgasse');
        expect(fixture.componentInstance.searchResults().length).toBe(1);

        const firstCalledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
        const secondCalledUrl = String(fetchSpy.mock.calls[1]?.[0] ?? '');
        expect(firstCalledUrl).toContain('q=denisgasse%2046');
        expect(secondCalledUrl).toContain('q=denisgasse');

        fetchSpy.mockRestore();
    });

    it('does not show a suggestion when strict query already returns matches', async () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const strictResult = {
            lat: '48.2082',
            lon: '16.3738',
            display_name: 'Denisgasse 46, Wien, Austria',
            address: {
                road: 'Denisgasse',
                house_number: '46',
                city: 'Wien',
                country: 'Austria',
            },
        };

        const fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(createJsonResponse([strictResult]));

        await (
            fixture.componentInstance as unknown as {
                fetchNominatim: (query: string) => Promise<void>;
            }
        ).fetchNominatim('Denisgase 46');

        expect(fixture.componentInstance.searchResults().length).toBe(1);
        expect(fixture.componentInstance.searchSuggestion()).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockRestore();
    });

    it('applySearchSuggestion() sets query, clears suggestion, and reruns search once', async () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.searchSuggestion.set('Denisgasse 46');
        const fetchNominatimSpy = vi
            .spyOn(
                fixture.componentInstance as unknown as {
                    fetchNominatim: (query: string) => Promise<void>;
                },
                'fetchNominatim',
            )
            .mockResolvedValue(undefined);

        fixture.componentInstance.applySearchSuggestion();

        expect(fixture.componentInstance.searchQuery()).toBe('Denisgasse 46');
        expect(fixture.componentInstance.searchSuggestion()).toBeNull();
        expect(fetchNominatimSpy).toHaveBeenCalledTimes(1);
        expect(fetchNominatimSpy).toHaveBeenCalledWith('Denisgasse 46');

        fetchNominatimSpy.mockRestore();
    });

    it('renders "Did you mean …" row when a fallback suggestion is available', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.searchQuery.set('Denisgase 46');
        fixture.componentInstance.dropdownOpen.set(true);
        fixture.componentInstance.searchSuggestion.set('Denisgasse 46');
        fixture.detectChanges();

        const suggestionRow = Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll('.search-dropdown__item-text'),
        ).find((node) => (node.textContent ?? '').includes('Did you mean Denisgasse 46?'));

        expect(suggestionRow).toBeTruthy();
    });

    it('dropdown is visible when dropdownOpen is true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.dropdownOpen.set(true);
        fixture.detectChanges();

        const dropdown = (fixture.nativeElement as HTMLElement).querySelector('.search-dropdown');
        expect(dropdown).not.toBeNull();
    });

    it('shows stored recent searches in focused-empty state', () => {
        localStorage.setItem(
            'sitesnap_recent_searches_anonymous',
            JSON.stringify(['Burgstrasse 7, Zurich', 'Bern Bahnhof']),
        );

        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.onSearchFocus();
        fixture.detectChanges();

        const recentItems = Array.from(
            (fixture.nativeElement as HTMLElement).querySelectorAll('.search-dropdown__item-text'),
        ).map((item) => item.textContent?.trim());

        expect(recentItems).toContain('Burgstrasse 7, Zurich');
        expect(recentItems).toContain('Bern Bahnhof');
    });

    it('stores committed search labels to localStorage as deduped MRU', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.selectSearchResult({
            lat: '47.3769',
            lon: '8.5417',
            display_name: 'Burgstrasse 7, Zurich, Switzerland',
            address: {
                road: 'Burgstrasse',
                house_number: '7',
                postcode: '8000',
                city: 'Zurich',
                country: 'Switzerland',
            },
        });

        fixture.componentInstance.selectSearchResult({
            lat: '46.9480',
            lon: '7.4474',
            display_name: 'Bahnhofplatz 1, Bern, Switzerland',
            address: {
                road: 'Bahnhofplatz',
                house_number: '1',
                postcode: '3011',
                city: 'Bern',
                country: 'Switzerland',
            },
        });

        fixture.componentInstance.selectSearchResult({
            lat: '47.3769',
            lon: '8.5417',
            display_name: 'Burgstrasse 7, Zurich, Switzerland',
            address: {
                road: 'Burgstrasse',
                house_number: '7',
                postcode: '8000',
                city: 'Zurich',
                country: 'Switzerland',
            },
        });

        const saved = JSON.parse(
            localStorage.getItem('sitesnap_recent_searches_anonymous') ?? '[]',
        ) as string[];

        expect(saved).toEqual(['Burgstrasse 7, 8000 Zurich Switzerland', 'Bahnhofplatz 1, 3011 Bern Switzerland']);
    });

    it('dropdown is not rendered when dropdownOpen is false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const dropdown = (fixture.nativeElement as HTMLElement).querySelector('.search-dropdown');
        expect(dropdown).toBeNull();
    });

    it('selectSearchResult() creates a search marker and keeps it while input matches label', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            addLayer: vi.fn(),
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(13),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;

        const result = {
            lat: '48.2082',
            lon: '16.3738',
            display_name: 'Stephansplatz 1, 1010 Wien, Austria',
            address: {
                road: 'Stephansplatz',
                house_number: '1',
                postcode: '1010',
                city: 'Wien',
                country: 'Austria',
            },
        };

        fixture.componentInstance.selectSearchResult(result);

        const marker = (fixture.componentInstance as unknown as { searchLocationMarker: unknown })
            .searchLocationMarker;
        expect(marker).not.toBeNull();

        const input = Object.assign(document.createElement('input'), {
            value: 'Stephansplatz 1, 1010 Wien Austria',
        });
        fixture.componentInstance.onSearchInput({ target: input } as unknown as Event);

        const markerAfterSameText =
            (fixture.componentInstance as unknown as { searchLocationMarker: unknown })
                .searchLocationMarker;
        expect(markerAfterSameText).not.toBeNull();
    });

    it('onSearchInput() removes search marker when selected address text changes', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            addLayer: vi.fn(),
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(13),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;

        const result = {
            lat: '48.2082',
            lon: '16.3738',
            display_name: 'Stephansplatz 1, 1010 Wien, Austria',
            address: {
                road: 'Stephansplatz',
                house_number: '1',
                postcode: '1010',
                city: 'Wien',
                country: 'Austria',
            },
        };

        fixture.componentInstance.selectSearchResult(result);

        const changedInput = Object.assign(document.createElement('input'), {
            value: 'Karlsplatz 1, 1010 Wien Austria',
        });
        fixture.componentInstance.onSearchInput({ target: changedInput } as unknown as Event);

        const marker = (fixture.componentInstance as unknown as { searchLocationMarker: unknown })
            .searchLocationMarker;
        expect(marker).toBeNull();
    });

    // ── Photo panel ────────────────────────────────────────────────────────────

    it('photoPanelOpen signal defaults to false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.photoPanelOpen()).toBe(false);
    });

    it('photo panel is not rendered when photoPanelOpen is false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const panel = (fixture.nativeElement as HTMLElement).querySelector('.photo-panel');
        expect(panel).toBeNull();
    });

    it('photo panel is rendered when photoPanelOpen is true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.photoPanelOpen.set(true);
        fixture.detectChanges();

        const panel = (fixture.nativeElement as HTMLElement).querySelector('.photo-panel');
        expect(panel).not.toBeNull();
    });

    it('drag divider is visible when photoPanelOpen is true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.photoPanelOpen.set(true);
        fixture.detectChanges();

        const divider = (fixture.nativeElement as HTMLElement).querySelector('.drag-divider');
        expect(divider).not.toBeNull();
    });
});
