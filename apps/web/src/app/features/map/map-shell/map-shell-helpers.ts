import * as L from 'leaflet';
import {
  buildPhotoMarkerHtml,
  PHOTO_MARKER_ICON_ANCHOR,
  PHOTO_MARKER_ICON_SIZE,
  PHOTO_MARKER_POPUP_ANCHOR,
  PhotoMarkerZoomLevel,
} from '../../../core/map/marker-factory';

export type MarkerVisualSnapshot = {
  count: number;
  thumbnailUrl?: string;
  thumbnailLoading?: boolean;
  direction?: number;
  corrected?: boolean;
  uploading?: boolean;
  selected: boolean;
  zoomLevel: PhotoMarkerZoomLevel;
};

export type PhotoMarkerState = {
  marker: L.Marker;
  count: number;
  lat: number;
  lng: number;
  thumbnailUrl?: string;
  thumbnailSourcePath?: string;
  direction?: number;
  corrected?: boolean;
  uploading?: boolean;
  optimistic?: boolean;
  lastRendered?: MarkerVisualSnapshot;
};

export type MarkerIconOverride = Partial<{
  count: number;
  thumbnailUrl?: string;
  direction?: number;
  corrected?: boolean;
  uploading?: boolean;
}>;

export type ViewportRow = {
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

export function buildBufferedViewportRequest(bounds: L.LatLngBounds, zoom: number) {
  const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.1;
  const lngPad = (bounds.getEast() - bounds.getWest()) * 0.1;
  const fetchSouth = bounds.getSouth() - latPad;
  const fetchWest = bounds.getWest() - lngPad;
  const fetchNorth = bounds.getNorth() + latPad;
  const fetchEast = bounds.getEast() + lngPad;

  return {
    fetchSouth,
    fetchWest,
    fetchNorth,
    fetchEast,
    roundedZoom: Math.round(zoom),
    fetchedBounds: L.latLngBounds([fetchSouth, fetchWest], [fetchNorth, fetchEast]),
  };
}

export function resolveThumbnailSourcePath(row: ViewportRow, count: number): string | undefined {
  return count === 1 ? (row.thumbnail_path ?? row.storage_path ?? undefined) : undefined;
}

export function buildMarkerVisualSnapshot(
  markerState: PhotoMarkerState,
  selected: boolean,
  zoomLevel: PhotoMarkerZoomLevel,
): MarkerVisualSnapshot {
  return {
    count: markerState.count,
    thumbnailUrl: markerState.thumbnailUrl,
    direction: markerState.direction,
    corrected: markerState.corrected,
    uploading: markerState.uploading,
    selected,
    zoomLevel,
  };
}

export function markerNeedsRefresh(
  previous: MarkerVisualSnapshot | undefined,
  next: MarkerVisualSnapshot,
): boolean {
  if (!previous) {
    return true;
  }

  return (
    previous.count !== next.count ||
    previous.thumbnailUrl !== next.thumbnailUrl ||
    previous.direction !== next.direction ||
    previous.corrected !== next.corrected ||
    previous.uploading !== next.uploading ||
    previous.selected !== next.selected ||
    previous.zoomLevel !== next.zoomLevel
  );
}

export function buildPhotoMarkerIcon(options: {
  markerState?: PhotoMarkerState;
  selected: boolean;
  zoomLevel: PhotoMarkerZoomLevel;
  override?: MarkerIconOverride;
}): L.DivIcon {
  const visual = resolveMarkerVisual(options.markerState, options.override);

  return L.divIcon({
    className: 'map-photo-marker-wrapper',
    html: buildPhotoMarkerHtml({
      count: visual.count,
      thumbnailUrl: visual.thumbnailUrl,
      bearing: visual.direction,
      selected: options.selected,
      corrected: visual.corrected,
      uploading: visual.uploading,
      zoomLevel: options.zoomLevel,
    }),
    iconSize: PHOTO_MARKER_ICON_SIZE,
    iconAnchor: PHOTO_MARKER_ICON_ANCHOR,
    popupAnchor: PHOTO_MARKER_POPUP_ANCHOR,
  });
}

export function buildPhotoMarkerMarkup(
  markerState: PhotoMarkerState,
  selected: boolean,
  zoomLevel: PhotoMarkerZoomLevel,
): string {
  return buildPhotoMarkerHtml({
    count: markerState.count,
    thumbnailUrl: markerState.thumbnailUrl,
    bearing: markerState.direction,
    selected,
    corrected: markerState.corrected,
    uploading: markerState.uploading,
    zoomLevel,
  });
}

export function mergeOverlappingClusters(
  map: L.Map | undefined,
  rows: ViewportRow[],
): ViewportRow[] {
  if (!map || rows.length === 0) {
    return rows;
  }

  const minDist = PHOTO_MARKER_ICON_SIZE[0] * 1.2;
  const minDistSq = minDist * minDist;
  const points = rows.map((row) => map.latLngToContainerPoint([row.cluster_lat, row.cluster_lng]));
  const consumed = new Set<number>();
  const result: ViewportRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (consumed.has(i)) {
      continue;
    }

    let totalCount = Number(rows[i].image_count);
    let weightedLat = rows[i].cluster_lat * totalCount;
    let weightedLng = rows[i].cluster_lng * totalCount;

    for (let j = i + 1; j < rows.length; j++) {
      if (consumed.has(j)) {
        continue;
      }

      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy >= minDistSq) {
        continue;
      }

      consumed.add(j);
      const rowCount = Number(rows[j].image_count);
      weightedLat += rows[j].cluster_lat * rowCount;
      weightedLng += rows[j].cluster_lng * rowCount;
      totalCount += rowCount;
    }

    const isSingle = totalCount === 1;
    result.push({
      ...rows[i],
      cluster_lat: weightedLat / totalCount,
      cluster_lng: weightedLng / totalCount,
      image_count: totalCount,
      image_id: isSingle ? rows[i].image_id : null,
      direction: isSingle ? rows[i].direction : null,
      storage_path: isSingle ? rows[i].storage_path : null,
      thumbnail_path: isSingle ? rows[i].thumbnail_path : null,
      exif_latitude: isSingle ? rows[i].exif_latitude : null,
      exif_longitude: isSingle ? rows[i].exif_longitude : null,
      created_at: isSingle ? rows[i].created_at : null,
    });
  }

  return result;
}

function resolveMarkerVisual(markerState?: PhotoMarkerState, override?: MarkerIconOverride) {
  return {
    count: override?.count ?? markerState?.count ?? 1,
    thumbnailUrl: override?.thumbnailUrl ?? markerState?.thumbnailUrl,
    direction: override?.direction ?? markerState?.direction,
    corrected: override?.corrected ?? markerState?.corrected,
    uploading: override?.uploading ?? markerState?.uploading,
  };
}
