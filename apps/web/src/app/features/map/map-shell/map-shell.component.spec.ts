/**
 * MapShellComponent unit tests.
 *
 * Strategy:
 *  - Leaflet is NOT initialised in tests because afterNextRender does not fire
 *    in the jsdom test environment. We verify the DOM structure only.
 *  - The map container element is required to be present so that when Leaflet
 *    does run in the browser it can attach to a real DOM node.
 *  - No real tile requests are made because the Leaflet init hook never fires.
 */

import { TestBed } from '@angular/core/testing';
import { MapShellComponent } from './map-shell.component';

describe('MapShellComponent', () => {
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MapShellComponent],
        }).compileComponents();
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
});
