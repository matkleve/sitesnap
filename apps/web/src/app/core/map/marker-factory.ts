export type PhotoMarkerZoomLevel = 'far' | 'mid' | 'near';

export interface PhotoMarkerHtmlOptions {
    count: number;
    thumbnailUrl?: string;
    selected?: boolean;
    corrected?: boolean;
    uploading?: boolean;
    bearing?: number | null;
    zoomLevel?: PhotoMarkerZoomLevel;
}

export const PHOTO_MARKER_ICON_SIZE: [number, number] = [64, 72];
export const PHOTO_MARKER_ICON_ANCHOR: [number, number] = [32, 60];
export const PHOTO_MARKER_POPUP_ANCHOR: [number, number] = [0, -52];

export function buildPhotoMarkerHtml(options: PhotoMarkerHtmlOptions): string {
    const count = Math.max(1, Math.floor(options.count));
    const hasSingleThumbnail = count === 1 && !!options.thumbnailUrl;
    const zoomLevel = options.zoomLevel ?? 'mid';
    const classes = [
        'map-photo-marker',
        hasSingleThumbnail ? 'map-photo-marker--single' : 'map-photo-marker--count',
        `map-photo-marker--zoom-${zoomLevel}`,
    ];

    if (options.selected) {
        classes.push('map-photo-marker--selected');
    }

    if (options.bearing != null) {
        classes.push('map-photo-marker--has-bearing');
    }

    const correctionDot = options.corrected
        ? '<span class="map-photo-marker__correction-dot" aria-hidden="true"></span>'
        : '';
    const pendingRing = options.uploading
        ? '<span class="map-photo-marker__pending-ring" aria-hidden="true"></span>'
        : '';
    const coneRotation = (options.bearing ?? 0) - 90;
    const directionCone = options.bearing != null
        ? `<span class="map-photo-marker__direction-cone" aria-hidden="true" style="transform:translateX(-8%) rotate(${coneRotation}deg)"></span>`
        : '';
    const content = hasSingleThumbnail
        ? `<img src="${escapeHtmlAttribute(options.thumbnailUrl)}" alt="Uploaded photo marker" />`
        : `<span class="map-photo-marker__count-label">${count}</span>`;

    return [
        `<div class="${classes.join(' ')}">`,
        '<span class="map-photo-marker__hit-zone">',
        `<span class="map-photo-marker__body">${content}</span>`,
        '<span class="map-photo-marker__tail" aria-hidden="true"></span>',
        correctionDot,
        pendingRing,
        directionCone,
        '</span>',
        '</div>',
    ].join('');
}

function escapeHtmlAttribute(value?: string): string {
    if (!value) return '';

    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}