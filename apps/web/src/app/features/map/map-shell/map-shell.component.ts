/**
 * MapShellComponent — the main application shell after authentication.
 *
 * Full-screen map with:
 *  - UploadButton: fixed top-left, hover-expands into UploadPanel.
 *  - SearchBar: floating top-center with Nominatim geocoding.
 *  - GPSButton: floating bottom-right, re-centres map on user position.
 *  - PhotoPanel: slides in from right (desktop) / bottom (mobile) on marker click.
 *  - DragDivider: resize handle shown when PhotoPanel is open.
 *
 * Ground rules:
 *  - Leaflet is initialised in afterNextRender so it only runs in the browser.
 *  - `map` is protected (not private) so unit tests can inject a mock instance.
 *  - Signals for all local UI state; no RxJS subjects.
 *  - Nominatim results are fetched with debounce (300 ms) via native fetch().
 */

import {
    Component,
    ElementRef,
    OnDestroy,
    afterNextRender,
    computed,
    signal,
    viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { UploadPanelComponent, ImageUploadedEvent } from '../../upload/upload-panel/upload-panel.component';
import { ExifCoords } from '../../../core/upload.service';

// Patch Leaflet default icon URLs so they resolve correctly from the Angular bundle.
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

/** A single result from the Nominatim geocoding API. */
export interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
}

@Component({
    selector: 'app-map-shell',
    imports: [UploadPanelComponent],
    templateUrl: './map-shell.component.html',
    styleUrl: './map-shell.component.scss',
})
export class MapShellComponent implements OnDestroy {
    /** Reference to the Leaflet map container div. */
    private readonly mapContainerRef = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');

    /** Reference to the UploadPanelComponent child (for placeFile calls). */
    private readonly uploadPanelChild = viewChild(UploadPanelComponent);

    /**
     * Leaflet map instance. Protected (not private) so unit tests can inject
     * a mock to test behaviour without initialising the real Leaflet map.
     */
    protected map?: L.Map;

    // ── Upload / placement state ─────────────────────────────────────────────

    /** True while pointer is over the upload button zone. */
    readonly uploadPanelHover = signal(false);

    /** True when user explicitly opened the upload panel via click. */
    readonly uploadPanelPinned = signal(false);

    /** Final visibility state: hover-preview OR click-pinned open. */
    readonly uploadPanelOpen = computed(
        () => this.uploadPanelHover() || this.uploadPanelPinned(),
    );

    /**
     * When non-null the map is in "placement mode": the next click places an
     * image that had no GPS EXIF data. Holds the upload-panel row key.
     */
    private pendingPlacementKey: string | null = null;

    /** Whether the map is in placement mode (drives the banner + cursor class). */
    readonly placementActive = signal(false);

    // ── GPS state ────────────────────────────────────────────────────────────

    /**
     * User's GPS position, populated after geolocation resolves.
     * Null when geolocation is denied/unavailable or not yet resolved.
     */
    readonly userPosition = signal<[number, number] | null>(null);

    /** Whether GPS follow mode is currently enabled by the user. */
    readonly gpsTrackingEnabled = signal(false);

    /** True while waiting for the first GPS fix after pressing the button. */
    readonly gpsLocating = signal(false);

    // ── Search state ─────────────────────────────────────────────────────────

    /** Current search input value. */
    readonly searchQuery = signal('');

    /** Nominatim geocoding results for the current query. */
    readonly searchResults = signal<NominatimResult[]>([]);

    /** Whether the search results dropdown is visible. */
    readonly dropdownOpen = signal(false);

    // ── Photo panel state ────────────────────────────────────────────────────

    /** Whether the PhotoPanel is slid open. */
    readonly photoPanelOpen = signal(false);

    // ── Private helpers ───────────────────────────────────────────────────────

    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private gpsWatchId: number | null = null;

    constructor() {
        afterNextRender(() => {
            this.initMap();
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.stopGpsTracking();
        this.map?.remove();
    }

    // ── Upload panel ──────────────────────────────────────────────────────────

    onUploadZoneEnter(): void {
        this.uploadPanelHover.set(true);
    }

    onUploadZoneLeave(): void {
        this.uploadPanelHover.set(false);
    }

    toggleUploadPanel(): void {
        this.uploadPanelPinned.update((v) => !v);
    }

    /**
     * Called when an image with GPS coords is uploaded. Adds a Leaflet marker.
     * Clicking the marker pins the side panel open (M-UI4 will populate it).
     */
    onImageUploaded(event: ImageUploadedEvent): void {
        if (!this.map) return;
        L.marker([event.lat, event.lng])
            .bindPopup(`Image uploaded (id: ${event.id})`)
            .addTo(this.map);
    }

    /** Enters placement mode for a file with no GPS EXIF data. */
    enterPlacementMode(key: string): void {
        this.pendingPlacementKey = key;
        this.placementActive.set(true);
        this.map?.getContainer().classList.add('map-container--placing');
    }

    /** Cancels placement mode without placing the image. */
    cancelPlacement(): void {
        this.pendingPlacementKey = null;
        this.placementActive.set(false);
        this.map?.getContainer().classList.remove('map-container--placing');
    }

    // ── GPS button ────────────────────────────────────────────────────────────

    /**
     * Toggles GPS follow mode.
     * - When enabling: starts watchPosition and keeps centering map on updates.
     * - When disabling: clears watcher and stops re-centering.
     */
    goToUserPosition(): void {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;

        if (this.gpsTrackingEnabled()) {
            this.stopGpsTracking();
            return;
        }

        this.gpsTrackingEnabled.set(true);
        const hasKnownPosition = this.recenterOnKnownUserPosition();
        this.gpsLocating.set(!hasKnownPosition);
        this.startGpsTracking();
    }

    // ── Search ────────────────────────────────────────────────────────────────

    /** Called on every keystroke in the search input. */
    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.searchQuery.set(value);
        this.dropdownOpen.set(true);

        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

        if (!value.trim()) {
            this.searchResults.set([]);
            return;
        }
        this.searchDebounceTimer = setTimeout(() => this.fetchNominatim(value), 300);
    }

    onSearchFocus(): void {
        this.dropdownOpen.set(true);
    }

    onSearchBlur(): void {
        // Delay so click on a result fires before dropdown closes.
        setTimeout(() => this.dropdownOpen.set(false), 150);
    }

    /** Pan map to selected geocode result. */
    selectSearchResult(result: NominatimResult): void {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        if (!isNaN(lat) && !isNaN(lon) && this.map) {
            this.map.setView([lat, lon], 14);
        }
        this.dropdownOpen.set(false);
        this.searchQuery.set(result.display_name);
    }

    private async fetchNominatim(query: string): Promise<void> {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
            const res = await fetch(url);
            const data: NominatimResult[] = await res.json();
            this.searchResults.set(data);
        } catch {
            this.searchResults.set([]);
        }
    }

    // ── Map init ──────────────────────────────────────────────────────────────

    private initMap(): void {
        this.map = L.map(this.mapContainerRef().nativeElement, {
            center: [48.2082, 16.3738], // Vienna, Austria (fallback)
            zoom: 13,
            zoomControl: true,
        });

        // CartoDB Positron — clean, uncluttered light tile (design.md §3.1).
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(this.map);

        // Request user GPS position; fall back to Vienna if denied.
        this.initGeolocation();

        // Map click handler: places images that had no GPS EXIF data.
        this.map.on('click', (e: L.LeafletMouseEvent) => {
            if (!this.pendingPlacementKey) return;
            const coords: ExifCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            const panel = this.uploadPanelChild();
            if (panel) {
                panel.placeFile(this.pendingPlacementKey, coords);
            }
            this.pendingPlacementKey = null;
            this.placementActive.set(false);
            this.map?.getContainer().classList.remove('map-container--placing');
        });

        // Any direct mouse interaction with the map exits GPS follow mode.
        // This makes tracking state clear immediately when the user starts to move manually.
        this.map.on('mousedown', () => {
            if (this.gpsTrackingEnabled()) {
                this.stopGpsTracking();
            }
        });
    }

    private initGeolocation(): void {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                this.userPosition.set(coords);
                this.map?.setView(coords, 13);
            },
            () => {
                // Geolocation denied or unavailable — Vienna fallback already set.
            },
        );
    }

    private startGpsTracking(): void {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;

        if (this.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                this.userPosition.set(coords);
                this.gpsLocating.set(false);
                const zoom = Math.max(this.map?.getZoom() ?? 0, 15);
                this.map?.setView(coords, zoom);
            },
            (error) => {
                this.gpsLocating.set(false);
                if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
                    this.stopGpsTracking();
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
        );
    }

    private recenterOnKnownUserPosition(): boolean {
        const coords = this.userPosition();
        if (!coords) return false;
        const zoom = Math.max(this.map?.getZoom() ?? 0, 15);
        this.map?.setView(coords, zoom);
        return true;
    }

    private stopGpsTracking(): void {
        if (typeof navigator !== 'undefined' && navigator.geolocation && this.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
        }
        this.gpsWatchId = null;
        this.gpsTrackingEnabled.set(false);
        this.gpsLocating.set(false);
    }
}

