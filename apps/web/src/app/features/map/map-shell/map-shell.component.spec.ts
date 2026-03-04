/**
 * MapShellComponent unit tests.
 *
 * Strategy:
 *  - Leaflet is NOT initialised in tests because afterNextRender does not fire
 *    in the jsdom test environment. We verify the DOM structure only.
 *  - The map container element is required to be present so that when Leaflet
 *    does run in the browser it can attach to a real DOM node.
 *  - No real tile requests are made because the Leaflet init hook never fires.
 *  - UploadService, AuthService, and SupabaseService are faked so no real
 *    Supabase calls occur (ground rule: no real HTTP in unit tests).
 *  - Router is provided as a spy to avoid NG04002 from AuthService injection.
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

    it('creates', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders a header toolbar with the SiteSnap brand', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const brand = (fixture.nativeElement as HTMLElement).querySelector('.map-toolbar__brand');
        expect(brand?.textContent).toContain('SiteSnap');
    });

    it('renders the map container element', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const container = (fixture.nativeElement as HTMLElement).querySelector('.map-container');
        expect(container).not.toBeNull();
    });

    it('renders the Upload button in the toolbar', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const btn = (fixture.nativeElement as HTMLElement).querySelector('.map-toolbar__btn');
        expect(btn?.textContent).toContain('Upload');
    });

    it('upload panel is not visible by default', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        expect(fixture.componentInstance.uploadPanelVisible()).toBe(false);
    });

    it('toggleUploadPanel() makes the panel visible', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();

        expect(fixture.componentInstance.uploadPanelVisible()).toBe(true);
    });

    it('toggleUploadPanel() hides the panel when called twice', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();

        fixture.componentInstance.toggleUploadPanel();
        fixture.componentInstance.toggleUploadPanel();

        expect(fixture.componentInstance.uploadPanelVisible()).toBe(false);
    });

    it('renders the app-upload-panel element', () => {
        const fixture = TestBed.createComponent(MapShellComponent);
        fixture.detectChanges();
        const panel = (fixture.nativeElement as HTMLElement).querySelector('app-upload-panel');
        expect(panel).not.toBeNull();
    });

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
});
