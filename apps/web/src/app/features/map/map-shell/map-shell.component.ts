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
    inject,
    signal,
    viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { UploadPanelComponent, ImageUploadedEvent } from '../../upload/upload-panel/upload-panel.component';
import { ExifCoords } from '../../../core/upload.service';
import { AuthService } from '../../../core/auth.service';

const RECENT_SEARCH_STORAGE_PREFIX = 'sitesnap_recent_searches_';
const RECENT_SEARCH_STORAGE_LIMIT = 8;
const RECENT_SEARCH_RENDER_LIMIT = 5;

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
export interface NominatimAddress {
    house_number?: string;
    road?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    county?: string;
    country?: string;
}

export interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
    importance?: number;
    address?: NominatimAddress;
}

@Component({
    selector: 'app-map-shell',
    imports: [UploadPanelComponent],
    templateUrl: './map-shell.component.html',
    styleUrl: './map-shell.component.scss',
})
export class MapShellComponent implements OnDestroy {
    private readonly authService = inject(AuthService);

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

    // ── GPS state ────────────────────────────────────────────────────────────

    /**
     * User's GPS position, populated after geolocation resolves.
     * Null when geolocation is denied/unavailable or not yet resolved.
     */
    readonly userPosition = signal<[number, number] | null>(null);

    /** True while waiting for a GPS fix after pressing the button. */
    readonly gpsLocating = signal(false);

    // ── Search state ─────────────────────────────────────────────────────────

    /** Current search input value. */
    readonly searchQuery = signal('');

    /** Nominatim geocoding results for the current query. */
    readonly searchResults = signal<NominatimResult[]>([]);

    /** Most-recent-first list of committed searches (persisted per user). */
    readonly recentSearches = signal<string[]>([]);

    /** Optional fallback suggestion when typo-tolerant matching is used. */
    readonly searchSuggestion = signal<string | null>(null);

    /** Whether the search results dropdown is visible. */
    readonly dropdownOpen = signal(false);

    // ── Photo panel state ────────────────────────────────────────────────────

    /** Whether the PhotoPanel is slid open. */
    readonly photoPanelOpen = signal(false);

    // ── Private helpers ───────────────────────────────────────────────────────

    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private userLocationMarker: L.Marker | null = null;
    private searchLocationMarker: L.Marker | null = null;
    private activeSearchMarkerLabel: string | null = null;
    private latestSearchRequestId = 0;
    private readonly uploadedPhotoMarkers = new Map<
        string,
        { marker: L.Marker; count: number; thumbnailUrl?: string }
    >();

    constructor() {
        this.loadRecentSearches();

        afterNextRender(() => {
            this.initMap();
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.gpsLocating.set(false);
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

    // ── Search ────────────────────────────────────────────────────────────────

    /** Called on every keystroke in the search input. */
    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.searchQuery.set(value);
        this.dropdownOpen.set(true);

        if (
            this.activeSearchMarkerLabel &&
            this.normalizeSearchMarkerLabel(value) !==
            this.normalizeSearchMarkerLabel(this.activeSearchMarkerLabel)
        ) {
            this.clearSearchLocationMarker();
        }

        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

        if (!value.trim()) {
            this.searchResults.set([]);
            this.searchSuggestion.set(null);
            this.clearSearchLocationMarker();
            return;
        }
        this.searchDebounceTimer = setTimeout(() => this.fetchNominatim(value), 300);
    }

    onSearchFocus(): void {
        this.loadRecentSearches();
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
        const label = this.formatSearchResultLabel(result);
        if (!isNaN(lat) && !isNaN(lon) && this.map) {
            this.map.setView([lat, lon], 14);
            this.renderOrUpdateSearchLocationMarker([lat, lon]);
        }
        this.addRecentSearch(label);
        this.dropdownOpen.set(false);
        this.searchSuggestion.set(null);
        this.searchQuery.set(label);
        this.activeSearchMarkerLabel = label;
    }

    selectRecentSearch(label: string): void {
        const normalized = label.trim();
        if (!normalized) return;

        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }

        this.searchQuery.set(normalized);
        this.searchSuggestion.set(null);
        this.addRecentSearch(normalized);
        void this.fetchNominatim(normalized);
    }

    getVisibleRecentSearches(): string[] {
        return this.recentSearches().slice(0, RECENT_SEARCH_RENDER_LIMIT);
    }

    applySearchSuggestion(): void {
        const suggestion = this.searchSuggestion();
        if (!suggestion) return;

        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.clearSearchLocationMarker();
        this.searchQuery.set(suggestion);
        this.searchSuggestion.set(null);
        void this.fetchNominatim(suggestion);
    }

    private async fetchNominatim(query: string): Promise<void> {
        const requestId = ++this.latestSearchRequestId;
        const normalizedQuery = this.normalizeSearchQuery(query);

        if (!normalizedQuery) {
            if (requestId === this.latestSearchRequestId) {
                this.searchResults.set([]);
                this.searchSuggestion.set(null);
            }
            return;
        }

        try {
            const primaryResults = await this.fetchNominatimByQuery(normalizedQuery);
            if (requestId !== this.latestSearchRequestId) return;

            if (primaryResults.length > 0) {
                this.searchResults.set(primaryResults);
                this.searchSuggestion.set(null);
                return;
            }

            const fallbackQueries = this.buildFallbackQueries(normalizedQuery);
            for (const fallbackQuery of fallbackQueries) {
                const fallbackResults = await this.fetchNominatimByQuery(fallbackQuery);
                if (requestId !== this.latestSearchRequestId) return;

                if (fallbackResults.length > 0) {
                    this.searchResults.set(fallbackResults);
                    this.searchSuggestion.set(this.prettifyQueryLabel(fallbackQuery));
                    return;
                }
            }

            this.searchResults.set([]);
            this.searchSuggestion.set(null);
        } catch {
            if (requestId !== this.latestSearchRequestId) return;
            this.searchResults.set([]);
            this.searchSuggestion.set(null);
        }
    }

    private async fetchNominatimByQuery(query: string): Promise<NominatimResult[]> {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const data: NominatimResult[] = await response.json();
        return Array.isArray(data) ? data : [];
    }

    private normalizeSearchQuery(query: string): string {
        const canonical = query
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ß/g, 'ss')
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return this.applyStreetTokenCorrections(canonical);
    }

    private applyStreetTokenCorrections(query: string): string {
        const corrected = query
            .split(' ')
            .map((token) => {
                if (!token) return token;

                if (token === 'g' || token === 'g.') return 'gasse';
                if (token === 'str' || token === 'str.') return 'strasse';

                if (token.endsWith('str.')) {
                    return `${token.slice(0, -1)}asse`;
                }

                if (token.endsWith('gass') || token.endsWith('gasse')) {
                    return token.endsWith('gasse') ? token : `${token}e`;
                }

                if (token.endsWith('gase')) {
                    return `${token.slice(0, -4)}gasse`;
                }

                if (token.endsWith('gas')) {
                    return `${token}se`;
                }

                if (token.endsWith('stras')) {
                    return `${token}se`;
                }

                if (token.endsWith('strase')) {
                    return `${token.slice(0, -6)}strasse`;
                }

                if (token.endsWith('strassee')) {
                    return token.slice(0, -1);
                }

                if (token.endsWith('str')) {
                    return `${token}asse`;
                }

                return token;
            })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        return corrected;
    }

    private buildFallbackQueries(normalizedQuery: string): string[] {
        const candidates = new Set<string>();
        const correctedStreetHouse = this.applyStreetTokenCorrections(normalizedQuery);

        if (correctedStreetHouse && correctedStreetHouse !== normalizedQuery) {
            candidates.add(correctedStreetHouse);
        }

        const streetOnlyBase = correctedStreetHouse || normalizedQuery;
        const streetOnly = this.toStreetOnlyQuery(streetOnlyBase);
        if (
            streetOnly &&
            streetOnly !== normalizedQuery &&
            streetOnly !== correctedStreetHouse
        ) {
            candidates.add(streetOnly);
        }

        const correctedStreetOnly = this.applyStreetTokenCorrections(streetOnly);
        if (
            correctedStreetOnly &&
            correctedStreetOnly !== normalizedQuery &&
            correctedStreetOnly !== correctedStreetHouse &&
            correctedStreetOnly !== streetOnly
        ) {
            candidates.add(correctedStreetOnly);
        }

        return [...candidates];
    }

    private toStreetOnlyQuery(query: string): string {
        return query.replace(/\s+\d+[a-zA-Z]?\s*$/, '').trim();
    }

    private prettifyQueryLabel(query: string): string {
        return query
            .split(' ')
            .map((token) => {
                if (!token) return token;
                if (/^\d+[a-zA-Z]?$/.test(token)) return token;
                return token.charAt(0).toUpperCase() + token.slice(1);
            })
            .join(' ');
    }

    formatSearchResultLabel(result: NominatimResult): string {
        const address = result.address;
        if (address) {
            const street = [address.road, address.house_number].filter(Boolean).join(' ').trim();
            const city =
                address.city ||
                address.town ||
                address.village ||
                address.municipality ||
                address.hamlet ||
                address.county;
            const zipCity = [address.postcode, city].filter(Boolean).join(' ').trim();
            const rightPart = [zipCity, address.country].filter(Boolean).join(' ').trim();

            if (street && rightPart) return `${street}, ${rightPart}`;
            if (street) return street;
            if (rightPart) return rightPart;
        }

        const parts = result.display_name
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length === 0) return result.display_name;

        const street = parts[0] ?? '';
        const country = parts[parts.length - 1] ?? '';
        const zipCity =
            parts.find((part) => /\b\d{4,6}\b/.test(part)) ??
            parts.slice(1, -1).find((part) => /\b\d{4,6}\b/.test(part)) ??
            parts[1] ?? '';

        const rightPart = [zipCity, country].filter(Boolean).join(' ').trim();
        if (street && rightPart) return `${street}, ${rightPart}`;
        if (street) return street;
        return result.display_name;
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
        this.activeSearchMarkerLabel = null;
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

            existing.marker.setIcon(this.buildPhotoMarkerIcon(nextCount, nextThumb));
            existing.marker.bindPopup(`${nextCount} images uploaded here`);
            return;
        }

        const marker = L.marker([event.lat, event.lng], {
            icon: this.buildPhotoMarkerIcon(1, event.thumbnailUrl),
        })
            .bindPopup(`Image uploaded (id: ${event.id})`)
            .addTo(this.map);

        this.uploadedPhotoMarkers.set(markerKey, {
            marker,
            count: 1,
            thumbnailUrl: event.thumbnailUrl,
        });
    }

    private buildPhotoMarkerIcon(count: number, thumbnailUrl?: string): L.DivIcon {
        const hasSingleThumbnail = count === 1 && !!thumbnailUrl;
        const html = hasSingleThumbnail
            ? `<div class="map-photo-marker map-photo-marker--single"><img src="${this.escapeHtmlAttribute(thumbnailUrl)}" alt="Uploaded photo marker" /></div>`
            : `<div class="map-photo-marker map-photo-marker--count"><span>${count}</span></div>`;

        return L.divIcon({
            className: 'map-photo-marker-wrapper',
            html,
            iconSize: [56, 56],
            iconAnchor: [28, 28],
            popupAnchor: [0, -32],
        });
    }

    private toMarkerKey(lat: number, lng: number): string {
        return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
    }

    private escapeHtmlAttribute(value?: string): string {
        if (!value) return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private loadRecentSearches(): void {
        const storage = this.getStorage();
        if (!storage) {
            this.recentSearches.set([]);
            return;
        }

        try {
            const raw = storage.getItem(this.getRecentSearchesStorageKey());
            if (!raw) {
                this.recentSearches.set([]);
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this.recentSearches.set([]);
                return;
            }

            const normalized = parsed
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
                .slice(0, RECENT_SEARCH_STORAGE_LIMIT);

            this.recentSearches.set(normalized);
        } catch {
            this.recentSearches.set([]);
        }
    }

    private addRecentSearch(label: string): void {
        const normalized = label.trim();
        if (!normalized) return;

        const existing = this.recentSearches();
        const withoutDuplicate = existing.filter(
            (item) => item.toLowerCase() !== normalized.toLowerCase(),
        );

        const next = [normalized, ...withoutDuplicate].slice(0, RECENT_SEARCH_STORAGE_LIMIT);
        this.recentSearches.set(next);
        this.persistRecentSearches(next);
    }

    private persistRecentSearches(items: string[]): void {
        const storage = this.getStorage();
        if (!storage) return;

        try {
            storage.setItem(this.getRecentSearchesStorageKey(), JSON.stringify(items));
        } catch {
            // Ignore storage failures and keep in-memory state.
        }
    }

    private getRecentSearchesStorageKey(): string {
        const userId = this.authService.user()?.id ?? 'anonymous';
        return `${RECENT_SEARCH_STORAGE_PREFIX}${userId}`;
    }

    private getStorage(): Storage | null {
        if (typeof window === 'undefined') return null;
        return window.localStorage;
    }

    private normalizeSearchMarkerLabel(value: string): string {
        return value.trim().toLowerCase();
    }
}

