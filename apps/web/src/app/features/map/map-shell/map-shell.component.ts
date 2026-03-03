/**
 * MapShellComponent — the main application shell after authentication.
 *
 * Ground rules:
 *  - Leaflet is initialized in afterNextRender so it can only run in the browser
 *    (never during SSR or when no DOM is present).
 *  - The map instance is stored as a class property for future features to use
 *    (viewport queries, marker layers, etc.).
 *  - This component is the entry point for M-IMPL3 and the parent shell for all
 *    future map-interaction features (upload panel, filter panel, etc.).
 *  - Leaflet's default icon URLs are patched here once so all layers work correctly
 *    when bundled with Angular's asset pipeline.
 */

import {
    Component,
    ElementRef,
    viewChild,
    afterNextRender,
    OnDestroy,
} from '@angular/core';
import * as L from 'leaflet';

// Patch Leaflet default icon URLs so they resolve correctly from the Angular bundle.
// This is required because Leaflet uses relative URLs that break with bundlers.
const iconDefault = L.icon({
    iconUrl: 'assets/leaflet/marker-icon.png',
    iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
    shadowUrl: 'assets/leaflet/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = iconDefault;

@Component({
    selector: 'app-map-shell',
    imports: [],
    templateUrl: './map-shell.component.html',
    styleUrl: './map-shell.component.scss',
})
export class MapShellComponent implements OnDestroy {
    /** Reference to the map container div defined in the template. */
    private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

    /** Leaflet map instance — set after first render. */
    private map?: L.Map;

    constructor() {
        // afterNextRender is the correct hook for DOM-dependent third-party libs.
        // It runs once, after the component's first render, in the browser only.
        afterNextRender(() => {
            this.initMap();
        });
    }

    ngOnDestroy(): void {
        // Remove the Leaflet map to release event listeners and tile layer connections.
        this.map?.remove();
    }

    private initMap(): void {
        this.map = L.map(this.mapContainer().nativeElement, {
            center: [20, 0],     // world center
            zoom: 2,
            zoomControl: true,
        });

        // OpenStreetMap tile layer — free for development. Attribution required.
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(this.map);
    }
}
