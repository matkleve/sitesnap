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
import {
  UploadPanelComponent,
  ImageUploadedEvent,
} from '../../upload/upload-panel/upload-panel.component';
import { ExifCoords } from '../../../core/upload.service';
import { SupabaseService } from '../../../core/supabase.service';
import {
  UploadManagerService,
  ImageReplacedEvent,
  ImageAttachedEvent,
  UploadFailedEvent,
} from '../../../core/upload-manager.service';
import { WorkspaceViewService } from '../../../core/workspace-view.service';
import { PhotoLoadService, PHOTO_PLACEHOLDER_ICON } from '../../../core/photo-load.service';
import { ToastService } from '../../../core/toast.service';
import { SearchBarComponent } from '../search-bar/search-bar.component';
import { WorkspacePaneComponent } from '../workspace-pane/workspace-pane.component';
import { DragDividerComponent } from '../workspace-pane/drag-divider/drag-divider.component';
import {
  buildPhotoMarkerHtml,
  PHOTO_MARKER_ICON_ANCHOR,
  PHOTO_MARKER_ICON_SIZE,
  PHOTO_MARKER_POPUP_ANCHOR,
  PhotoMarkerZoomLevel,
} from '../../../core/map/marker-factory';

@Component({
  selector: 'app-map-shell',
  imports: [UploadPanelComponent, SearchBarComponent, WorkspacePaneComponent, DragDividerComponent],
  templateUrl: './map-shell.component.html',
  styleUrl: './map-shell.component.scss',
  host: {
    '[style.--placeholder-icon]': 'placeholderIconUrl',
  },
})
export class MapShellComponent implements OnDestroy {
  readonly placeholderIconUrl = `url("${PHOTO_PLACEHOLDER_ICON}")`;
  private readonly supabaseService = inject(SupabaseService);
  private readonly uploadManagerService = inject(UploadManagerService);
  private readonly workspaceViewService = inject(WorkspaceViewService);
  private readonly photoLoadService = inject(PhotoLoadService);
  private readonly toastService = inject(ToastService);

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

  // ── Workspace pane / photo panel state ───────────────────────────────────

  /** Whether the workspace pane (photo panel) is open. */
  readonly photoPanelOpen = signal(false);

  /** Current workspace pane width in px. Initialised lazily to golden-ratio default on first open. */
  readonly workspacePaneWidth = signal(360);

  /** Minimum workspace pane width in px (17.5rem). */
  readonly workspacePaneMinWidth = 280;

  /** Maximum workspace pane width: viewport minus map minimum (~320px) minus divider. */
  readonly workspacePaneMaxWidth = computed(() => {
    // Fallback to a reasonable default before DOM is available.
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return Math.max(this.workspacePaneMinWidth, viewportWidth - 320);
  });

  /**
   * Default workspace pane width when opening — golden ratio of the viewport
   * (viewport × 0.382, i.e. the minor segment of the golden cut), clamped to
   * [workspacePaneMinWidth, workspacePaneMaxWidth].
   */
  readonly workspacePaneDefaultWidth = computed(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const golden = Math.round(viewportWidth * (1 - 1 / 1.618));
    return Math.min(Math.max(golden, this.workspacePaneMinWidth), this.workspacePaneMaxWidth());
  });
  readonly selectedMarkerKey = signal<string | null>(null);

  /**
   * When non-null, the Image Detail View is shown inside the photo panel.
   * Set to a DB image UUID when the user clicks a thumbnail or marker detail action.
   * Set to null to return to the thumbnail grid.
   */
  readonly detailImageId = signal<string | null>(null);

  /** Thumbnail URL for the currently selected single marker. */
  readonly selectedMarkerThumbnail = computed(() => {
    const key = this.selectedMarkerKey();
    if (!key) return null;
    const state = this.uploadedPhotoMarkers.get(key);
    return state?.thumbnailUrl ?? null;
  });

  /** DB image UUID for the currently selected single marker. */
  readonly selectedMarkerImageId = computed(() => {
    const key = this.selectedMarkerKey();
    if (!key) return null;
    return this.uploadedPhotoMarkers.get(key)?.imageId ?? null;
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
      thumbnailSourcePath?: string;
      direction?: number;
      corrected?: boolean;
      uploading?: boolean;
      sourceCells?: Array<{ lat: number; lng: number }>;
      /** DB UUID of the image — set for single-image markers only. */
      imageId?: string;
      /** True for markers added via upload before the next viewport query. */
      optimistic?: boolean;
      /** True while a signed thumbnail URL is being fetched. */
      thumbnailLoading?: boolean;
      /** Epoch ms when the signed thumbnail URL was obtained. */
      signedAt?: number;
      /** Snapshot of the last rendered state for dirty-checking. */
      lastRendered?: {
        count: number;
        thumbnailUrl?: string;
        thumbnailLoading?: boolean;
        direction?: number;
        corrected?: boolean;
        uploading?: boolean;
        selected: boolean;
        zoomLevel: PhotoMarkerZoomLevel;
      };
    }
  >();

  /** Timer handle for the moveend debounce. */
  private moveEndDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** AbortController for in-flight viewport queries. */
  private viewportQueryController: AbortController | null = null;

  /** Tracks the last zoom level to detect threshold crossings. */
  private lastZoomLevel: PhotoMarkerZoomLevel = 'mid';

  /** LayerGroup for all photo markers — enables batch add/remove. */
  private photoMarkerLayer: L.LayerGroup | null = null;

  /**
   * Bounds that were last fetched (including 10% buffer).
   * Used to skip RPC when the viewport is still within the buffered area.
   */
  private lastFetchedBounds: L.LatLngBounds | null = null;
  private lastFetchedZoom: number | null = null;

  /** True while a zoom animation is in progress — suppresses moveend queries. */
  private zoomAnimating = false;

  /**
   * Secondary index: imageId → markerKey for O(1) lookups when
   * handling upload manager events (replace, attach).
   */
  private readonly markersByImageId = new Map<string, string>();

  /** Subscriptions for upload manager events — cleaned up in ngOnDestroy. */
  private uploadManagerSubs: { unsubscribe(): void }[] = [];

  constructor() {
    afterNextRender(() => {
      this.initMap();
      this.subscribeToUploadManagerEvents();
      void this.workspaceViewService.loadCustomProperties();
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.gpsLocating.set(false);
    if (this.moveEndDebounceTimer) {
      clearTimeout(this.moveEndDebounceTimer);
      this.moveEndDebounceTimer = null;
    }
    this.viewportQueryController?.abort();
    this.viewportQueryController = null;
    this.photoMarkerLayer?.clearLayers();
    this.uploadedPhotoMarkers.clear();
    this.markersByImageId.clear();
    for (const sub of this.uploadManagerSubs) sub.unsubscribe();
    this.uploadManagerSubs = [];
    this.userLocationMarker?.remove();
    this.userLocationMarker = null;
    this.clearSearchLocationMarker();
    this.map?.remove();
  }

  // ── Workspace pane resize ─────────────────────────────────────────────────

  onWorkspaceWidthChange(newWidth: number): void {
    this.workspacePaneWidth.set(newWidth);
    // After resize, invalidate the Leaflet map size so tiles re-render.
    this.map?.invalidateSize();
  }

  /** Closes the Image Detail View and returns to the thumbnail grid. */
  closeDetailView(): void {
    this.detailImageId.set(null);
  }

  /** Closes the workspace pane entirely and clears selection state. */
  closeWorkspacePane(): void {
    this.photoPanelOpen.set(false);
    this.detailImageId.set(null);
    this.setSelectedMarker(null);
    this.workspaceViewService.clearActiveSelection();
    // Let Angular remove the pane from the DOM, then tell Leaflet to reclaim the space.
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  /**
   * Opens the Image Detail View for the given DB image UUID.
   * Also ensures the photo panel is open.
   */
  openDetailView(imageId: string): void {
    if (!this.photoPanelOpen()) {
      this.workspacePaneWidth.set(this.workspacePaneDefaultWidth());
    }
    this.detailImageId.set(imageId);
    this.photoPanelOpen.set(true);
  }

  /**
   * Handles the zoomToLocationRequested output from the detail view.
   * Flies the map to the photo's coordinates at zoom 18 and pulses the marker.
   */
  onZoomToLocation(event: { imageId: string; lat: number; lng: number }): void {
    if (!this.map) return;
    this.map.flyTo([event.lat, event.lng], 18);

    // Pulse the marker after the fly animation completes
    this.map.once('moveend', () => {
      const markerKey = this.markersByImageId.get(event.imageId);
      const state = markerKey ? this.uploadedPhotoMarkers.get(markerKey) : undefined;
      const el = state?.marker?.getElement();
      if (el) {
        el.classList.add('marker-pulse');
        setTimeout(() => el.classList.remove('marker-pulse'), 1500);
      }
    });
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

    // LayerGroup for all photo markers — batch add/remove.
    this.photoMarkerLayer = L.layerGroup().addTo(this.map);

    // Request user GPS position; fall back to Vienna if denied.
    this.initGeolocation();
    void this.queryViewportMarkers();

    // Map click handler: closes upload panel and, when active, places images
    // that had no GPS EXIF data.
    this.map.on('click', (e: L.LeafletMouseEvent) => this.handleMapClick(e));

    // Suppress viewport queries during zoom animation to avoid rapid
    // fire-and-cancel cycles that cause visible lag.
    this.map.on('zoomstart', () => {
      this.zoomAnimating = true;
    });
    this.map.on('zoomend', () => {
      this.zoomAnimating = false;
    });

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
      // Deselect the active marker but keep the workspace pane open.
      // The pane is closed only via its own close button.
      this.setSelectedMarker(null);
      this.detailImageId.set(null);
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

  /**
   * Subscribe to UploadManagerService events for replace/attach photo flows.
   * Updates marker thumbnails without a full viewport refresh.
   */
  private subscribeToUploadManagerEvents(): void {
    this.uploadManagerSubs.push(
      this.uploadManagerService.imageReplaced$.subscribe((event: ImageReplacedEvent) => {
        this.handleImageReplaced(event);
      }),
      this.uploadManagerService.imageAttached$.subscribe((event: ImageAttachedEvent) => {
        this.handleImageAttached(event);
      }),
      this.uploadManagerService.uploadFailed$.subscribe((event: UploadFailedEvent) => {
        this.toastService.show({ message: event.error, type: 'error' });
      }),
    );
  }

  /**
   * Handles imageReplaced$ — rebuilds the marker DivIcon with the new
   * localObjectUrl so the thumbnail swaps instantly (no placeholder flash).
   */
  private handleImageReplaced(event: ImageReplacedEvent): void {
    const markerKey = this.markersByImageId.get(event.imageId);
    if (!markerKey) return;
    const state = this.uploadedPhotoMarkers.get(markerKey);
    if (!state) return;

    // Revoke the old ObjectURL if it was a blob.
    if (state.thumbnailUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(state.thumbnailUrl);
    }

    state.thumbnailUrl = event.localObjectUrl;
    state.signedAt = undefined; // Will be re-signed on next viewport query.
    state.direction = event.direction ?? state.direction;
    this.refreshPhotoMarker(markerKey);
  }

  /**
   * Handles imageAttached$ — transitions the marker from CSS placeholder
   * to real thumbnail using the localObjectUrl from the upload.
   */
  private handleImageAttached(event: ImageAttachedEvent): void {
    const markerKey = this.markersByImageId.get(event.imageId);
    if (!markerKey) return;
    const state = this.uploadedPhotoMarkers.get(markerKey);
    if (!state) return;

    // Revoke the old ObjectURL if it was a blob.
    if (state.thumbnailUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(state.thumbnailUrl);
    }

    state.thumbnailUrl = event.localObjectUrl;
    state.signedAt = undefined;
    state.direction = event.direction ?? state.direction;
    state.thumbnailSourcePath = event.newStoragePath;
    this.refreshPhotoMarker(markerKey);
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
    });

    this.photoMarkerLayer!.addLayer(marker);
    this.attachMarkerInteractions(markerKey, marker);

    this.uploadedPhotoMarkers.set(markerKey, {
      marker,
      count: 1,
      lat: event.lat,
      lng: event.lng,
      thumbnailUrl: event.thumbnailUrl,
      direction: event.direction,
      imageId: event.id,
      optimistic: true,
    });

    // Maintain secondary index for upload manager event lookups.
    if (event.id) {
      this.markersByImageId.set(event.id, markerKey);
    }
  }

  /**
   * Viewport-driven marker query.
   * Calls the `viewport_markers` RPC which returns server-side clusters
   * at low zoom and individual markers at high zoom. Reconciles the
   * result against existing markers (add / remove / update).
   */
  private async queryViewportMarkers(): Promise<void> {
    if (!this.map) return;

    // Abort any in-flight query.
    this.viewportQueryController?.abort();
    const controller = new AbortController();
    this.viewportQueryController = controller;

    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();

    // 10 % buffer on each edge for pre-fetch.
    const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.1;
    const lngPad = (bounds.getEast() - bounds.getWest()) * 0.1;

    const fetchSouth = bounds.getSouth() - latPad;
    const fetchWest = bounds.getWest() - lngPad;
    const fetchNorth = bounds.getNorth() + latPad;
    const fetchEast = bounds.getEast() + lngPad;
    const roundedZoom = Math.round(zoom);

    const { data, error } = await this.supabaseService.client.rpc('viewport_markers', {
      min_lat: fetchSouth,
      min_lng: fetchWest,
      max_lat: fetchNorth,
      max_lng: fetchEast,
      zoom: roundedZoom,
    });

    // If this query was aborted, discard the result.
    if (controller.signal.aborted) return;
    this.viewportQueryController = null;

    // Cache the fetched bounds so small pans can skip the RPC.
    this.lastFetchedBounds = L.latLngBounds([fetchSouth, fetchWest], [fetchNorth, fetchEast]);
    this.lastFetchedZoom = roundedZoom;

    if (error || !data) return;

    type ViewportRow = {
      cluster_lat: number;
      cluster_lng: number;
      image_count: number;
      image_id: string | null;
      direction: number | null;
      storage_path: string | null;
      thumbnail_path: string | null;
      exif_latitude: number | null;
      exif_longitude: number | null;
      created_at: string | null;
    };

    // Client-side pixel-distance merge: collapse clusters whose on-screen
    // distance is less than the marker icon width. This fixes the grid
    // boundary problem where adjacent grid cells produce overlapping markers.
    const merged = this.mergeOverlappingClusters(data as ViewportRow[]);

    // Build the incoming marker set keyed the same way we store them.
    type MergedRow = ViewportRow & { sourceCells: Array<{ lat: number; lng: number }> };
    const incoming = new Map<string, MergedRow>();
    for (const row of merged) {
      if (typeof row.cluster_lat !== 'number' || typeof row.cluster_lng !== 'number') continue;
      const key = this.toMarkerKey(row.cluster_lat, row.cluster_lng);
      incoming.set(key, row);
    }

    // --- Remove markers that left the viewport (skip optimistic ones) ---
    for (const [key, state] of this.uploadedPhotoMarkers) {
      if (state.optimistic) continue; // keep until next reconciliation
      if (!incoming.has(key)) {
        this.photoMarkerLayer!.removeLayer(state.marker);
        // Clean up secondary index for removed markers.
        if (state.imageId) {
          this.markersByImageId.delete(state.imageId);
        }
        this.uploadedPhotoMarkers.delete(key);
      }
    }

    // --- Add or update markers ---
    for (const [key, row] of incoming) {
      const existing = this.uploadedPhotoMarkers.get(key);
      const count = Number(row.image_count);
      const direction = row.direction ?? undefined;
      const corrected =
        count === 1 &&
        row.exif_latitude != null &&
        row.exif_longitude != null &&
        (row.cluster_lat !== row.exif_latitude || row.cluster_lng !== row.exif_longitude);
      const thumbnailSourcePath =
        count === 1 ? (row.thumbnail_path ?? row.storage_path ?? undefined) : undefined;

      if (existing) {
        // Revoke stale ObjectURL when signed URL takes over from optimistic blob.
        if (
          existing.thumbnailUrl &&
          existing.thumbnailUrl.startsWith('blob:') &&
          thumbnailSourcePath
        ) {
          URL.revokeObjectURL(existing.thumbnailUrl);
          existing.thumbnailUrl = undefined;
          existing.signedAt = undefined;
        }
        // Update imageId index if it changed (e.g. cluster split to single).
        const newImageId = count === 1 ? (row.image_id ?? undefined) : undefined;
        if (existing.imageId !== newImageId) {
          if (existing.imageId) this.markersByImageId.delete(existing.imageId);
          if (newImageId) this.markersByImageId.set(newImageId, key);
          existing.imageId = newImageId;
        }
        // Update if data changed.
        if (
          existing.count !== count ||
          existing.direction !== direction ||
          existing.corrected !== corrected
        ) {
          existing.count = count;
          existing.direction = direction;
          existing.corrected = corrected;
          existing.thumbnailSourcePath = thumbnailSourcePath;
          existing.sourceCells = row.sourceCells;
          existing.optimistic = false;
          this.refreshPhotoMarker(key);
        } else {
          // Always keep sourceCells in sync even if visuals haven't changed.
          existing.sourceCells = row.sourceCells;
        }
        continue;
      }

      // New marker — add to LayerGroup (not directly to map) for batch ops.
      const marker = L.marker([row.cluster_lat, row.cluster_lng], {
        icon: this.buildPhotoMarkerIcon(key, { count, direction, corrected }),
      });

      this.photoMarkerLayer!.addLayer(marker);
      this.attachMarkerInteractions(key, marker);

      this.uploadedPhotoMarkers.set(key, {
        marker,
        count,
        lat: row.cluster_lat,
        lng: row.cluster_lng,
        sourceCells: row.sourceCells,
        direction,
        corrected,
        thumbnailSourcePath,
        imageId: count === 1 ? (row.image_id ?? undefined) : undefined,
      });

      // Maintain secondary index for single-image markers.
      if (count === 1 && row.image_id) {
        this.markersByImageId.set(row.image_id, key);
      }
    }

    // Clear optimistic flag from surviving markers.
    for (const state of this.uploadedPhotoMarkers.values()) {
      state.optimistic = false;
    }

    // Lazy-load thumbnails for all single-image markers in viewport.
    this.maybeLoadThumbnails();
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
    const loading = markerState?.thumbnailLoading ?? false;

    return L.divIcon({
      className: 'map-photo-marker-wrapper',
      html: buildPhotoMarkerHtml({
        count,
        thumbnailUrl,
        bearing: direction,
        selected: markerKey === this.selectedMarkerKey(),
        corrected,
        uploading,
        loading,
        zoomLevel: this.getPhotoMarkerZoomLevel(),
      }),
      iconSize: PHOTO_MARKER_ICON_SIZE,
      iconAnchor: PHOTO_MARKER_ICON_ANCHOR,
      popupAnchor: PHOTO_MARKER_POPUP_ANCHOR,
    });
  }

  private handlePhotoMarkerClick(markerKey: string): void {
    const markerState = this.uploadedPhotoMarkers.get(markerKey);
    if (!markerState) {
      return;
    }

    // Always open pane and mark marker selected.
    this.setSelectedMarker(markerKey);
    if (!this.photoPanelOpen()) {
      this.workspacePaneWidth.set(this.workspacePaneDefaultWidth());
    }
    this.photoPanelOpen.set(true);

    // Load images at this marker's grid position(s) into the workspace view.
    const zoom = Math.round(this.map?.getZoom() ?? 13);
    const cells = markerState.sourceCells ?? [{ lat: markerState.lat, lng: markerState.lng }];
    void this.workspaceViewService.loadMultiClusterImages(cells, zoom);

    // Single-image marker: also jump directly to detail view.
    if (markerState.count === 1 && markerState.imageId) {
      this.openDetailView(markerState.imageId);
    } else {
      // Cluster click: ensure detail view is dismissed so thumbnail grid shows.
      this.detailImageId.set(null);
    }
  }

  /** Attach click + touch long-press interactions consistently for each new marker. */
  private attachMarkerInteractions(markerKey: string, marker: L.Marker): void {
    marker.on('click', () => this.handlePhotoMarkerClick(markerKey));
    // Attach long-press handler for touch direction cone after element is in DOM.
    marker.once('add', () => {
      const el = marker.getElement();
      if (el) this.attachLongPressHandler(el);
    });
  }

  /**
   * Attach a 500 ms long-press handler to a marker element.
   * On long press, toggles `.map-photo-marker--long-pressed` so the direction
   * cone is visible on touch devices (mirrors the desktop `:hover` affordance).
   */
  private attachLongPressHandler(el: HTMLElement): void {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    el.addEventListener(
      'pointerdown',
      () => {
        longPressTimer = setTimeout(() => {
          el.classList.add('map-photo-marker--long-pressed');
        }, 500);
      },
      { passive: true },
    );

    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    el.addEventListener('pointerup', cancelLongPress, { passive: true });
    el.addEventListener('pointercancel', cancelLongPress, { passive: true });
    el.addEventListener('pointermove', cancelLongPress, { passive: true });
    // Dismiss on tap/click.
    el.addEventListener('click', () => {
      cancelLongPress();
      el.classList.remove('map-photo-marker--long-pressed');
    });
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
   * Fires a viewport query on every moveend (pan or zoom) so the
   * marker set always matches the visible area + zoom-level grid.
   */
  private handleMoveEnd(): void {
    if (this.moveEndDebounceTimer) {
      clearTimeout(this.moveEndDebounceTimer);
    }

    this.moveEndDebounceTimer = setTimeout(() => {
      this.moveEndDebounceTimer = null;

      // Skip query if still in a zoom animation — it'll fire after zoomend.
      if (this.zoomAnimating) return;

      const currentZoom = this.getPhotoMarkerZoomLevel();
      const zoomChanged = currentZoom !== this.lastZoomLevel;

      // Skip the RPC if zoom didn't change and viewport is still inside
      // the last-fetched bounds (which included a 10% buffer).
      const mapZoom = Math.round(this.map?.getZoom() ?? 0);
      const viewportInBuffer =
        !zoomChanged &&
        this.lastFetchedBounds &&
        this.lastFetchedZoom === mapZoom &&
        this.map &&
        this.lastFetchedBounds.contains(this.map.getBounds());

      if (!viewportInBuffer) {
        void this.queryViewportMarkers();
      }

      // Refresh existing marker icons if zoom-level threshold changed.
      if (zoomChanged) {
        this.lastZoomLevel = currentZoom;
        for (const markerKey of this.uploadedPhotoMarkers.keys()) {
          this.refreshPhotoMarker(markerKey);
        }
      }
    }, 350);
  }

  /**
   * Lazy-load thumbnails for single-image markers visible in the current viewport.
   * Fires for all zoom levels — single-image markers always show a photo.
   * Only requests signed URLs for markers without a URL yet, and proactively
   * refreshes URLs older than 50 minutes.
   */
  private maybeLoadThumbnails(): void {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const now = Date.now();
    const staleThreshold = 50 * 60 * 1000; // 50 minutes

    this.photoLoadService.invalidateStale(staleThreshold);

    for (const [key, state] of this.uploadedPhotoMarkers) {
      if (state.count !== 1 || !bounds.contains([state.lat, state.lng])) continue;

      // Proactively clear stale URLs so they get re-signed.
      if (state.thumbnailUrl && state.signedAt && now - state.signedAt > staleThreshold) {
        state.thumbnailUrl = undefined;
        state.signedAt = undefined;
      }

      if (!state.thumbnailUrl && state.thumbnailSourcePath && !state.thumbnailLoading) {
        void this.lazyLoadThumbnail(key, state);
      }
    }
  }

  /**
   * Fetch a signed thumbnail URL for one marker with server-side
   * image transformation (80×80 cover). Updates the marker icon
   * once the URL is available, or leaves the placeholder on error.
   */
  private async lazyLoadThumbnail(
    key: string,
    state: {
      thumbnailSourcePath?: string;
      thumbnailUrl?: string;
      thumbnailLoading?: boolean;
      signedAt?: number;
    },
  ): Promise<void> {
    if (!state.thumbnailSourcePath || state.thumbnailUrl || state.thumbnailLoading) return;

    state.thumbnailLoading = true;
    this.refreshPhotoMarker(key);

    const result = await this.photoLoadService.getSignedUrl(state.thumbnailSourcePath, 'marker');

    if (result.url) {
      const loaded = await this.photoLoadService.preload(result.url);
      state.thumbnailLoading = false;
      if (loaded) {
        state.thumbnailUrl = result.url;
        state.signedAt = Date.now();
      }
    } else {
      state.thumbnailLoading = false;
    }
    // On error or preload failure: thumbnailUrl stays undefined → placeholder remains visible.
    this.refreshPhotoMarker(key);
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
      last.thumbnailLoading === markerState.thumbnailLoading &&
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
      thumbnailLoading: markerState.thumbnailLoading,
      direction: markerState.direction,
      corrected: markerState.corrected,
      uploading: markerState.uploading,
      selected,
      zoomLevel,
    };

    // Direct innerHTML swap instead of setIcon() — avoids destroying
    // and recreating the entire DOM subtree for every update.
    const el = (markerState.marker as L.Marker).getElement();
    if (el) {
      const html = buildPhotoMarkerHtml({
        count: markerState.count,
        thumbnailUrl: markerState.thumbnailUrl,
        bearing: markerState.direction,
        selected: markerKey === this.selectedMarkerKey(),
        corrected: markerState.corrected,
        uploading: markerState.uploading,
        loading: markerState.thumbnailLoading,
        zoomLevel: this.getPhotoMarkerZoomLevel(),
      });
      el.innerHTML = html;
    } else {
      // Fallback if element not yet in DOM.
      markerState.marker.setIcon(this.buildPhotoMarkerIcon(markerKey));
    }
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

  /**
   * Client-side pixel-distance merge pass.
   *
   * Grid-based clustering can leave cluster centers right at cell
   * boundaries, producing overlapping markers. This greedy merge
   * converts each cluster to screen-space pixels and collapses any
   * pair whose distance is less than the marker icon width (+ 20 %
   * breathing room). Runs in O(n²) on the already-small result set
   * (≤ 2 000 rows), so sub-millisecond.
   */
  private mergeOverlappingClusters<
    T extends {
      cluster_lat: number;
      cluster_lng: number;
      image_count: number;
      image_id: string | null;
      direction: number | null;
      storage_path: string | null;
      thumbnail_path: string | null;
      exif_latitude: number | null;
      exif_longitude: number | null;
      created_at: string | null;
    },
  >(rows: T[]): Array<T & { sourceCells: Array<{ lat: number; lng: number }> }> {
    if (!this.map || rows.length === 0)
      return rows.map((r) => ({ ...r, sourceCells: [{ lat: r.cluster_lat, lng: r.cluster_lng }] }));

    const minDist = PHOTO_MARKER_ICON_SIZE[0] * 1.2; // 64 px + 20 % gap
    const minDistSq = minDist * minDist;

    // Pre-compute pixel positions once.
    const points = rows.map((row) =>
      this.map!.latLngToContainerPoint([row.cluster_lat, row.cluster_lng]),
    );

    const consumed = new Set<number>();
    const result: Array<T & { sourceCells: Array<{ lat: number; lng: number }> }> = [];

    for (let i = 0; i < rows.length; i++) {
      if (consumed.has(i)) continue;

      // Accumulate weighted position + totals for the merge group.
      let totalCount = Number(rows[i].image_count);
      let wLat = rows[i].cluster_lat * totalCount;
      let wLng = rows[i].cluster_lng * totalCount;

      // Track original grid-cell centres so we can query all of them on click.
      const sourceCells: Array<{ lat: number; lng: number }> = [
        { lat: rows[i].cluster_lat, lng: rows[i].cluster_lng },
      ];

      for (let j = i + 1; j < rows.length; j++) {
        if (consumed.has(j)) continue;
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        if (dx * dx + dy * dy < minDistSq) {
          consumed.add(j);
          const jCount = Number(rows[j].image_count);
          wLat += rows[j].cluster_lat * jCount;
          wLng += rows[j].cluster_lng * jCount;
          totalCount += jCount;
          sourceCells.push({ lat: rows[j].cluster_lat, lng: rows[j].cluster_lng });
        }
      }

      const isSingle = totalCount === 1;
      result.push({
        ...rows[i],
        cluster_lat: wLat / totalCount,
        cluster_lng: wLng / totalCount,
        image_count: totalCount,
        // Preserve single-image fields only when there's truly one image.
        image_id: isSingle ? rows[i].image_id : null,
        direction: isSingle ? rows[i].direction : null,
        storage_path: isSingle ? rows[i].storage_path : null,
        thumbnail_path: isSingle ? rows[i].thumbnail_path : null,
        exif_latitude: isSingle ? rows[i].exif_latitude : null,
        exif_longitude: isSingle ? rows[i].exif_longitude : null,
        created_at: isSingle ? rows[i].created_at : null,
        sourceCells,
      } as T & { sourceCells: Array<{ lat: number; lng: number }> });
    }

    return result;
  }

  /**
   * Build a stable key from snapped coordinates the server returns.
   * Uses 7 decimal places (server rounds to 7) so the key matches
   * exactly as long as the same server row is returned.
   */
  private toMarkerKey(lat: number, lng: number): string {
    return `${lat.toFixed(7)}:${lng.toFixed(7)}`;
  }
}
