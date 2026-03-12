/** Parsed coordinate pair. */
export interface DetectedCoordinates {
  lat: number;
  lng: number;
}

/** Matches decimal coordinates like `47.3769, 8.5417` or `47.3769 8.5417`. */
const DECIMAL_COORDS_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Matches DMS like `47°22'36.8"N 8°32'30.1"E`. */
const DMS_COORDS_RE =
  /(\d{1,3})\s*°\s*(\d{1,2})\s*[''′]\s*([\d.]+)\s*["″]\s*([NSns])\s*[,\s]?\s*(\d{1,3})\s*°\s*(\d{1,2})\s*[''′]\s*([\d.]+)\s*["″]\s*([EWew])/;

/** Matches Google Maps URLs with embedded lat/lng. */
const GOOGLE_MAPS_AT_RE = /google\.\w+\/maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/;
const GOOGLE_MAPS_LL_RE = /google\.\w+\/maps.*[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;
const GOOGLE_MAPS_QUERY_RE = /google\.\w+\/maps.*[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;

const GOOGLE_MAPS_PATTERNS = [GOOGLE_MAPS_AT_RE, GOOGLE_MAPS_LL_RE, GOOGLE_MAPS_QUERY_RE];

function parseDecimalPair(latStr: string, lngStr: string): DetectedCoordinates | null {
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseDms(match: RegExpMatchArray): DetectedCoordinates | null {
  const latDeg = parseInt(match[1], 10);
  const latMin = parseInt(match[2], 10);
  const latSec = parseFloat(match[3]);
  const latDir = match[4].toUpperCase();

  const lngDeg = parseInt(match[5], 10);
  const lngMin = parseInt(match[6], 10);
  const lngSec = parseFloat(match[7]);
  const lngDir = match[8].toUpperCase();

  let lat = latDeg + latMin / 60 + latSec / 3600;
  let lng = lngDeg + lngMin / 60 + lngSec / 3600;

  if (latDir === 'S') lat = -lat;
  if (lngDir === 'W') lng = -lng;

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Detect coordinates from user input — decimal pairs, DMS, or Google Maps URLs.
 * Returns `null` when the input doesn't match any known coordinate format.
 */
export function detectCoordinates(input: string): DetectedCoordinates | null {
  const trimmed = input.trim();

  for (const re of GOOGLE_MAPS_PATTERNS) {
    const urlMatch = trimmed.match(re);
    if (urlMatch) return parseDecimalPair(urlMatch[1], urlMatch[2]);
  }

  const dmsMatch = trimmed.match(DMS_COORDS_RE);
  if (dmsMatch) return parseDms(dmsMatch);

  const decimalMatch = trimmed.match(DECIMAL_COORDS_RE);
  if (decimalMatch) return parseDecimalPair(decimalMatch[1], decimalMatch[2]);

  return null;
}
