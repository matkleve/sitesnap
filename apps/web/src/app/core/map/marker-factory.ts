export type PhotoMarkerZoomLevel = 'far' | 'mid' | 'near';

export interface PhotoMarkerHtmlOptions {
  count: number;
  thumbnailUrl?: string;
  selected?: boolean;
  corrected?: boolean;
  uploading?: boolean;
  bearing?: number | null;
  zoomLevel?: PhotoMarkerZoomLevel;
  /** True while a signed thumbnail URL is being fetched (shows loading pulse). */
  loading?: boolean;
}

export const PHOTO_MARKER_ICON_SIZE: [number, number] = [40, 40];
export const PHOTO_MARKER_ICON_ANCHOR: [number, number] = [20, 20];
export const PHOTO_MARKER_POPUP_ANCHOR: [number, number] = [0, -24];

export function buildPhotoMarkerHtml(options: PhotoMarkerHtmlOptions): string {
  const count = Math.max(1, Math.floor(options.count));
  const hasSingleThumbnail = count === 1 && !!options.thumbnailUrl;
  const isPlaceholder = count === 1 && !options.thumbnailUrl;

  const classes = buildMarkerClasses(options, count, hasSingleThumbnail, isPlaceholder);
  const content = buildMarkerContent(
    count,
    hasSingleThumbnail,
    isPlaceholder,
    options.thumbnailUrl,
  );
  const overlays = buildMarkerOverlays(options);

  return [
    `<div class="${classes}">`,
    '<span class="map-photo-marker__hit-zone">',
    `<span class="map-photo-marker__body">${content}</span>`,
    overlays,
    '</span>',
    '</div>',
  ].join('');
}

function buildMarkerClasses(
  options: PhotoMarkerHtmlOptions,
  count: number,
  hasSingleThumbnail: boolean,
  isPlaceholder: boolean,
): string {
  const zoomLevel = options.zoomLevel ?? 'mid';
  const classes = ['map-photo-marker', `map-photo-marker--zoom-${zoomLevel}`];

  if (hasSingleThumbnail) {
    classes.push('map-photo-marker--single');
  } else if (isPlaceholder) {
    classes.push('map-photo-marker--placeholder');
    if (options.loading) classes.push('is-loading');
  } else {
    classes.push('map-photo-marker--count');
  }

  if (options.selected) classes.push('map-photo-marker--selected');
  if (options.bearing != null) classes.push('map-photo-marker--has-bearing');

  return classes.join(' ');
}

function buildMarkerContent(
  count: number,
  hasSingleThumbnail: boolean,
  isPlaceholder: boolean,
  thumbnailUrl?: string,
): string {
  if (hasSingleThumbnail) {
    return `<img src="${escapeHtmlAttribute(thumbnailUrl)}" alt="" onerror="this.parentElement.classList.add('map-photo-marker__body--error');this.remove()" />`;
  }
  if (isPlaceholder) {
    return '<span class="map-photo-marker__placeholder-icon" aria-hidden="true"></span>';
  }
  const displayCount = count > 999 ? '999+' : String(count);
  return `<span class="map-photo-marker__count-label">${displayCount}</span>`;
}

function buildMarkerOverlays(options: PhotoMarkerHtmlOptions): string {
  const parts: string[] = [];

  if (options.corrected) {
    parts.push('<span class="map-photo-marker__correction-dot" aria-hidden="true"></span>');
  }
  if (options.uploading) {
    parts.push('<span class="map-photo-marker__pending-ring" aria-hidden="true"></span>');
  }
  if (options.bearing != null) {
    const rotation = (options.bearing ?? 0) - 90;
    parts.push(
      `<span class="map-photo-marker__direction-cone" aria-hidden="true" style="transform:translate(-50%, -50%) translateX(-8%) rotate(${rotation}deg)"></span>`,
    );
  }

  return parts.join('');
}

function escapeHtmlAttribute(value?: string): string {
  if (!value) return '';

  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
