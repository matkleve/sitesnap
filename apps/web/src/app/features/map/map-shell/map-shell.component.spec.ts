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

    it('hover opens upload panel preview and leave closes it when not pinned', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.onUploadZoneEnter();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(true);

        fixture.componentInstance.onUploadZoneLeave();
        expect(fixture.componentInstance.uploadPanelOpen()).toBe(false);
    });

    it('click-pinned upload panel stays open after mouse leave', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();
        fixture.componentInstance.onUploadZoneLeave();

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

    it('gpsTrackingEnabled signal defaults to false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance.gpsTrackingEnabled()).toBe(false);
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

    it('GPS button has --tracking modifier class when tracking is enabled', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.gpsTrackingEnabled.set(true);
        fixture.detectChanges();

        const btn = (fixture.nativeElement as HTMLElement).querySelector('.map-gps-btn');
        expect(btn?.classList).toContain('map-gps-btn--tracking');
    });

    it('GPS button shows spinner while locating', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.gpsLocating.set(true);
        fixture.detectChanges();

        const spinner = (fixture.nativeElement as HTMLElement).querySelector('.map-gps-btn__spinner');
        expect(spinner).not.toBeNull();
    });

    it('goToUserPosition() toggles GPS tracking on and off', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(13),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;

        const originalGeolocation = navigator.geolocation;
        const watchPosition = vi.fn().mockReturnValue(7);
        const clearWatch = vi.fn();

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: vi.fn(),
                watchPosition,
                clearWatch,
            },
        });

        fixture.componentInstance.goToUserPosition();
        expect(fixture.componentInstance.gpsTrackingEnabled()).toBe(true);
        expect(watchPosition).toHaveBeenCalledTimes(1);

        fixture.componentInstance.goToUserPosition();
        expect(fixture.componentInstance.gpsTrackingEnabled()).toBe(false);
        expect(clearWatch).toHaveBeenCalledWith(7);

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: originalGeolocation,
        });
    });

    it('goToUserPosition() recenters immediately when userPosition is already known', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const mapStub = {
            setView: vi.fn(),
            getZoom: vi.fn().mockReturnValue(12),
            remove: vi.fn(),
        };
        (fixture.componentInstance as unknown as { map: unknown }).map = mapStub;
        fixture.componentInstance.userPosition.set([51.5, -0.12]);

        const originalGeolocation = navigator.geolocation;
        const watchPosition = vi.fn().mockReturnValue(9);

        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: vi.fn(),
                watchPosition,
                clearWatch: vi.fn(),
            },
        });

        fixture.componentInstance.goToUserPosition();

        expect(mapStub.setView).toHaveBeenCalledWith([51.5, -0.12], 15);
        expect(fixture.componentInstance.gpsLocating()).toBe(false);
        expect(watchPosition).toHaveBeenCalledTimes(1);

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

    it('dropdown is visible when dropdownOpen is true', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.dropdownOpen.set(true);
        fixture.detectChanges();

        const dropdown = (fixture.nativeElement as HTMLElement).querySelector('.search-dropdown');
        expect(dropdown).not.toBeNull();
    });

    it('dropdown is not rendered when dropdownOpen is false', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        const dropdown = (fixture.nativeElement as HTMLElement).querySelector('.search-dropdown');
        expect(dropdown).toBeNull();
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
