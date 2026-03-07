/**
 * MapShellComponent — the main application shell after authentication.
 *
 * Full-screen map with:
 *  - UploadButton: fixed top-right, click-toggles the UploadPanel.
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
    inject,
    signal,
    viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { UploadPanelComponent, ImageUploadedEvent } from '../../upload/upload-panel/upload-panel.component';
import { ExifCoords } from '../../../core/upload.service';
import { SupabaseService } from '../../../core/supabase.service';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import {
    buildPhotoMarkerHtml,
    PHOTO_MARKER_ICON_ANCHOR,
    PHOTO_MARKER_ICON_SIZE,
    PHOTO_MARKER_POPUP_ANCHOR,
    PhotoMarkerZoomLevel,
} from '../../../core/map/marker-factory';

const PHOTO_MARKER_CLUSTER_GRID_DECIMALS = 4;

@Component({
    selector: 'app-map-shell',
    imports: [UploadPanelComponent, SearchBarComponent],
    templateUrl: './map-shell.component.html',
    styleUrl: './map-shell.component.scss',
})
export class MapShellComponent implements OnDestroy {
    private readonly supabaseService = inject(SupabaseService);

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

    /** True when user explicitly opened the upload panel via click. */
    readonly uploadPanelPinned = signal(false);

    /** Final visibility state: click-pinned open only. */
    readonly uploadPanelOpen = this.uploadPanelPinned;

    /**
     * When non-null the map is in "placement mode": the next click places an
     * image that had no GPS EXIF data. Holds the upload-panel row key.
     */
    private pendingPlacementKey: string | null = null;

    /** Whether the map is in placement mode (drives the banner + cursor class). */
    readonly placementActive = signal(false);
    readonly searchPlacementActive = signal(false);

    // ── GPS state ────────────────────────────────────────────────────────────

    /**
     * User's GPS position, populated after geolocation resolves.
     * Null when geolocation is denied/unavailable or not yet resolved.
     */
    readonly userPosition = signal<[number, number] | null>(null);

    /** True while waiting for a GPS fix after pressing the button. */
    readonly gpsLocating = signal(false);

    // ── Photo panel state ────────────────────────────────────────────────────

    /** Whether the PhotoPanel is slid open. */
    readonly photoPanelOpen = signal(false);
    readonly selectedMarkerKey = signal<string | null>(null);

    /** Thumbnail URL for the currently selected single marker. */
    readonly selectedMarkerThumbnail = computed(() => {
        const key = this.selectedMarkerKey();
        if (!key) return null;
        const state = this.uploadedPhotoMarkers.get(key);
        return state?.thumbnailUrl ?? null;
    });

    // ── Private helpers ───────────────────────────────────────────────────────

    private userLocationMarker: L.Marker | null = null;
    private searchLocationMarker: L.Marker | null = null;
    private readonly uploadedPhotoMarkers = new Map<
        string,
        {
            marker: L.Marker;
            count: number;
            lat: number;
            lng: number;
            thumbnailUrl?: string;
            direction?: number;
            corrected?: boolean;
            uploading?: boolean;
            /** Snapshot of the last rendered state for dirty-checking. */
            lastRendered?: {
                count: number;
                thumbnailUrl?: string;
                direction?: number;
                corrected?: boolean;
                uploading?: boolean;
                selected: boolean;
                zoomLevel: PhotoMarkerZoomLevel;
            };
        }
    >();

    private readonly initialPhotoMarkerLimit = 500;

    /** Timer handle for the moveend debounce. */
    private moveEndDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Tracks the last zoom level to detect threshold crossings. */
    private lastZoomLevel: PhotoMarkerZoomLevel = 'mid';

    constructor() {
        afterNextRender(() => {
            this.initMap();
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        this.gpsLocating.set(false);
        if (this.moveEndDebounceTimer) {
            clearTimeout(this.moveEndDebounceTimer);
            this.moveEndDebounceTimer = null;
        }
        this.uploadedPhotoMarkers.clear();
        this.userLocationMarker?.remove();
        this.userLocationMarker = null;
        this.clearSearchLocationMarker();
        this.map?.remove();
    }

    // ── Upload panel ──────────────────────────────────────────────────────────

    toggleUploadPanel(): void {
        this.uploadPanelPinned.update((v) => !v);
    }

    /**
     * Called when an image with GPS coords is uploaded. Adds a Leaflet marker.
     * Clicking the marker pins the side panel open (M-UI4 will populate it).
     */
    onImageUploaded(event: ImageUploadedEvent): void {
        if (!this.map) return;
        this.upsertUploadedPhotoMarker(event);
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
        this.searchPlacementActive.set(false);
        this.map?.getContainer().classList.remove('map-container--placing');
    }

    // ── GPS button ────────────────────────────────────────────────────────────

    /**
     * Recenters on the user's position once.
     * If a recent position is already known, reuses it without requesting GPS again.
     */
    goToUserPosition(): void {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;

        const hasKnownPosition = this.recenterOnKnownUserPosition();
        if (hasKnownPosition) {
            return;
        }

        this.gpsLocating.set(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                this.userPosition.set(coords);
                this.renderOrUpdateUserLocationMarker(coords);
                const zoom = Math.max(this.map?.getZoom() ?? 0, 15);
                this.map?.setView(coords, zoom);
                this.gpsLocating.set(false);
            },
            () => {
                this.gpsLocating.set(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
        );
    }

    onSearchMapCenterRequested(event: { lat: number; lng: number; label: string }): void {
        if (!this.map) return;

        this.map.setView([event.lat, event.lng], 14);
        this.renderOrUpdateSearchLocationMarker([event.lat, event.lng]);
    }

    onSearchClearRequested(): void {
        this.clearSearchLocationMarker();
    }

    onSearchDropPinRequested(): void {
        this.pendingPlacementKey = null;
        this.placementActive.set(false);
        this.searchPlacementActive.set(true);
        this.map?.getContainer().classList.add('map-container--placing');
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
        void this.loadInitialPhotoMarkers();

        // Map click handler: closes upload panel and, when active, places images
        // that had no GPS EXIF data.
        this.map.on('click', (e: L.LeafletMouseEvent) => this.handleMapClick(e));

        // Debounced moveend: refreshes markers only when zoom-level threshold changes.
        // No marker DOM work during zoom animation — all updates fire after moveend.
        this.map.on('moveend', () => this.handleMoveEnd());

    }

    private initGeolocation(): void {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                this.userPosition.set(coords);
                this.renderOrUpdateUserLocationMarker(coords);
                this.map?.setView(coords, 13);
            },
            () => {
                // Geolocation denied or unavailable — Vienna fallback already set.
            },
        );
    }

    private recenterOnKnownUserPosition(): boolean {
        const coords = this.userPosition();
        if (!coords) return false;
        const zoom = Math.max(this.map?.getZoom() ?? 0, 15);
        this.map?.setView(coords, zoom);
        return true;
    }

    private handleMapClick(e: L.LeafletMouseEvent): void {
        this.uploadPanelPinned.set(false);
        if (this.pendingPlacementKey) {
            const coords: ExifCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
            const panel = this.uploadPanelChild();
            if (panel) {
                panel.placeFile(this.pendingPlacementKey, coords);
            }
            this.pendingPlacementKey = null;
            this.placementActive.set(false);
            this.map?.getContainer().classList.remove('map-container--placing');
            return;
        }

        if (!this.searchPlacementActive()) {
            this.setSelectedMarker(null);
            this.photoPanelOpen.set(false);
            return;
        }

        this.renderOrUpdateSearchLocationMarker([e.latlng.lat, e.latlng.lng]);
        this.searchPlacementActive.set(false);
        this.map?.getContainer().classList.remove('map-container--placing');
    }

    private renderOrUpdateUserLocationMarker(coords: [number, number]): void {
        if (!this.map) return;

        if (!this.userLocationMarker) {
            const icon = L.divIcon({
                className: 'map-user-location-marker',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            });

            this.userLocationMarker = L.marker(coords, {
                icon,
                interactive: false,
                keyboard: false,
            }).addTo(this.map);
            return;
        }

        this.userLocationMarker.setLatLng(coords);
    }

    private renderOrUpdateSearchLocationMarker(coords: [number, number]): void {
        if (!this.map) return;

        if (!this.searchLocationMarker) {
            const icon = L.divIcon({
                className: 'map-search-location-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });

            this.searchLocationMarker = L.marker(coords, {
                icon,
                interactive: false,
                keyboard: false,
            }).addTo(this.map);
            return;
        }

        this.searchLocationMarker.setLatLng(coords);
    }

    private clearSearchLocationMarker(): void {
        this.searchLocationMarker?.remove();
        this.searchLocationMarker = null;
    }

    private upsertUploadedPhotoMarker(event: ImageUploadedEvent): void {
        if (!this.map) return;

        const markerKey = this.toMarkerKey(event.lat, event.lng);
        const existing = this.uploadedPhotoMarkers.get(markerKey);

        if (existing) {
            const nextCount = existing.count + 1;
            const nextThumb = existing.thumbnailUrl ?? event.thumbnailUrl;
            existing.count = nextCount;
            existing.thumbnailUrl = nextThumb;
            existing.direction ??= event.direction;

            if (nextCount > 1 && this.selectedMarkerKey() === markerKey) {
                this.setSelectedMarker(null);
                this.photoPanelOpen.set(false);
            }

            existing.marker.setIcon(this.buildPhotoMarkerIcon(markerKey));
            return;
        }

        const marker = L.marker([event.lat, event.lng], {
            icon: this.buildPhotoMarkerIcon(markerKey, {
                count: 1,
                thumbnailUrl: event.thumbnailUrl,
                direction: event.direction,
            }),
        }).addTo(this.map);

        marker.on('click', () => this.handlePhotoMarkerClick(markerKey));

        this.uploadedPhotoMarkers.set(markerKey, {
            marker,
            count: 1,
            lat: event.lat,
            lng: event.lng,
            thumbnailUrl: event.thumbnailUrl,
            direction: event.direction,
        });
    }

    private async loadInitialPhotoMarkers(): Promise<void> {
        if (!this.map) return;

        const { data, error } = await this.supabaseService.client
            .from('images')
            .select('id, latitude, longitude, exif_latitude, exif_longitude, direction, thumbnail_path, storage_path, created_at')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('created_at', { ascending: false })
            .limit(this.initialPhotoMarkerLimit);

        if (error || !data || data.length === 0) return;

        type ImageMarkerRow = {
            id: string;
            latitude: number;
            longitude: number;
            exif_latitude: number | null;
            exif_longitude: number | null;
            direction: number | null;
            thumbnail_path: string | null;
            storage_path: string;
            created_at: string;
        };

        const grouped = new Map<string, { rows: ImageMarkerRow[]; lat: number; lng: number }>();

        for (const row of data as ImageMarkerRow[]) {
            if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') continue;
            const key = this.toMarkerKey(row.latitude, row.longitude);
            const existing = grouped.get(key);
            if (existing) {
                existing.rows.push(row);
                continue;
            }

            grouped.set(key, {
                rows: [row],
                lat: row.latitude,
                lng: row.longitude,
            });
        }

        for (const [key, group] of grouped) {
            const count = group.rows.length;
            let thumbnailUrl: string | undefined;

            if (count === 1) {
                const sourcePath = group.rows[0].thumbnail_path ?? group.rows[0].storage_path;
                const signed = await this.supabaseService.client.storage
                    .from('images')
                    .createSignedUrl(sourcePath, 3600);

                if (!signed.error) {
                    thumbnailUrl = signed.data.signedUrl;
                }
            }

            // Direction from the first row that has one.
            const direction = group.rows.find((r) => r.direction != null)?.direction ?? undefined;

            // Corrected = coordinates differ from immutable EXIF originals.
            const corrected =
                count === 1 &&
                group.rows[0].exif_latitude != null &&
                group.rows[0].exif_longitude != null &&
                (group.rows[0].latitude !== group.rows[0].exif_latitude ||
                    group.rows[0].longitude !== group.rows[0].exif_longitude);

            const marker = L.marker([group.lat, group.lng], {
                icon: this.buildPhotoMarkerIcon(key, {
                    count,
                    thumbnailUrl,
                    direction,
                    corrected,
                }),
            }).addTo(this.map);

            marker.on('click', () => this.handlePhotoMarkerClick(key));

            this.uploadedPhotoMarkers.set(key, {
                marker,
                count,
                lat: group.lat,
                lng: group.lng,
                thumbnailUrl,
                direction,
                corrected,
            });
        }
    }

    private buildPhotoMarkerIcon(
        markerKey: string,
        override?: Partial<{
            count: number;
            thumbnailUrl?: string;
            direction?: number;
            corrected?: boolean;
            uploading?: boolean;
        }>,
    ): L.DivIcon {
        const markerState = this.uploadedPhotoMarkers.get(markerKey);
        const count = override?.count ?? markerState?.count ?? 1;
        const thumbnailUrl = override?.thumbnailUrl ?? markerState?.thumbnailUrl;
        const direction = override?.direction ?? markerState?.direction;
        const corrected = override?.corrected ?? markerState?.corrected;
        const uploading = override?.uploading ?? markerState?.uploading;

        return L.divIcon({
            className: 'map-photo-marker-wrapper',
            html: buildPhotoMarkerHtml({
                count,
                thumbnailUrl,
                bearing: direction,
                selected: markerKey === this.selectedMarkerKey(),
                corrected,
                uploading,
                zoomLevel: this.getPhotoMarkerZoomLevel(),
            }),
            iconSize: PHOTO_MARKER_ICON_SIZE,
            iconAnchor: PHOTO_MARKER_ICON_ANCHOR,
            popupAnchor: PHOTO_MARKER_POPUP_ANCHOR,
        });
    }

    private handlePhotoMarkerClick(markerKey: string): void {
        const markerState = this.uploadedPhotoMarkers.get(markerKey);
        if (!markerState || !this.map) {
            return;
        }

        if (markerState.count > 1) {
            const currentZoom = this.map.getZoom();
            if (currentZoom >= 18) {
                // At max zoom, expand cluster into workspace pane.
                this.setSelectedMarker(markerKey);
                this.photoPanelOpen.set(true);
                return;
            }
            this.setSelectedMarker(null);
            this.photoPanelOpen.set(false);
            this.map.setView([markerState.lat, markerState.lng], Math.min(currentZoom + 2, 18));
            return;
        }

        this.setSelectedMarker(markerKey);
        this.photoPanelOpen.set(true);
    }

    private setSelectedMarker(markerKey: string | null): void {
        const previousMarkerKey = this.selectedMarkerKey();
        if (previousMarkerKey === markerKey) {
            return;
        }

        this.selectedMarkerKey.set(markerKey);

        if (previousMarkerKey) {
            this.refreshPhotoMarker(previousMarkerKey);
        }

        if (markerKey) {
            this.refreshPhotoMarker(markerKey);
        }
    }

    /**
     * Debounced handler for the Leaflet `moveend` event.
     * Only refreshes all marker icons when the zoom-level threshold
     * (far / mid / near) has changed, avoiding unnecessary DOM churn.
     */
    private handleMoveEnd(): void {
        if (this.moveEndDebounceTimer) {
            clearTimeout(this.moveEndDebounceTimer);
        }

        this.moveEndDebounceTimer = setTimeout(() => {
            this.moveEndDebounceTimer = null;
            const currentZoom = this.getPhotoMarkerZoomLevel();
            if (currentZoom !== this.lastZoomLevel) {
                this.lastZoomLevel = currentZoom;
                this.refreshAllPhotoMarkers();
            }
        }, 300);
    }

    private refreshAllPhotoMarkers(): void {
        for (const markerKey of this.uploadedPhotoMarkers.keys()) {
            this.refreshPhotoMarker(markerKey);
        }
    }

    private refreshPhotoMarker(markerKey: string): void {
        const markerState = this.uploadedPhotoMarkers.get(markerKey);
        if (!markerState) {
            return;
        }

        const selected = markerKey === this.selectedMarkerKey();
        const zoomLevel = this.getPhotoMarkerZoomLevel();
        const last = markerState.lastRendered;

        // Skip DOM update when nothing visual has changed.
        if (
            last &&
            last.count === markerState.count &&
            last.thumbnailUrl === markerState.thumbnailUrl &&
            last.direction === markerState.direction &&
            last.corrected === markerState.corrected &&
            last.uploading === markerState.uploading &&
            last.selected === selected &&
            last.zoomLevel === zoomLevel
        ) {
            return;
        }

        markerState.lastRendered = {
            count: markerState.count,
            thumbnailUrl: markerState.thumbnailUrl,
            direction: markerState.direction,
            corrected: markerState.corrected,
            uploading: markerState.uploading,
            selected,
            zoomLevel,
        };

        markerState.marker.setIcon(this.buildPhotoMarkerIcon(markerKey));
    }

    private getPhotoMarkerZoomLevel(): PhotoMarkerZoomLevel {
        const zoom = this.map?.getZoom() ?? 13;

        if (zoom >= 16) {
            return 'near';
        }

        if (zoom >= 13) {
            return 'mid';
        }

        return 'far';
    }

    private toMarkerKey(lat: number, lng: number): string {
        return `${lat.toFixed(PHOTO_MARKER_CLUSTER_GRID_DECIMALS)}:${lng.toFixed(PHOTO_MARKER_CLUSTER_GRID_DECIMALS)}`;
    }

}

