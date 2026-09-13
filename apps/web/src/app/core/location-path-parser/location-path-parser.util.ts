import { COUNTRY_NAMES, CITY_REGISTRY } from './city-registry.const';
import { STREET_KEYWORDS } from './street-keywords.const';

export const NOISE_SEGMENTS = new Set([
  'fotos',
  'fotos von montag',
  'urlaub',
  'neu',
  'misc',
  'images',
  'bilder',
  'camera',
  'kamera',
  // Period folders. A construction site files by week, and `Woche 12` is not an address.
  'woche',
  'kw',
  'tag',
  'monat',
  'jahr',
  'week',
  'day',
  'month',
  'year',
]);

export function normalizeSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One spelling for one street. `Wilhelminenstr 141` and `Wilhelminenstraße 141` are the same address,
 * so comparing them must not produce a question; `ß` folds to `ss` for the same reason.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
export function foldStreetSpelling(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(/([a-z]*)str\.?(?=\s|$)/g, (_match, prefix: string) => `${prefix}strasse`);
}

export function splitPathSegments(fullPath: string): string[] {
  return fullPath
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function isNoiseSegment(segment: string): boolean {
  const normalized = normalizeSegment(segment);
  if (NOISE_SEGMENTS.has(normalized)) {
    return true;
  }
  // `Woche 12`, `KW 07`, `Kamera A`: a noise word plus a counter is still noise.
  const [firstWord] = normalized.split(' ');
  return /^[\w-]{1,3}$|^\d+$/.test(normalized.split(' ').slice(1).join('')) && NOISE_SEGMENTS.has(firstWord);
}

export function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

export function detectCountryCode(segment: string): string | null {
  const normalized = normalizeSegment(segment);
  for (const [code, aliases] of Object.entries(COUNTRY_NAMES)) {
    if (aliases.includes(normalized)) {
      return code;
    }
  }
  return null;
}

export interface RegistryCityMatch {
  city: string;
  country: string;
}

/**
 * Every registry row whose name or alias matches the segment exactly.
 *
 * Plural because the country is derived from this match: two rows in different countries sharing a
 * name is an ambiguity the caller must see, not silently resolve to the first row.
 * @see docs/specs/service/media-upload-service/upload-search-object.country-derivation.md
 */
export function findCitiesBySegment(segment: string): RegistryCityMatch[] {
  const normalized = normalizeSegment(segment);
  const matches: RegistryCityMatch[] = [];
  for (const city of CITY_REGISTRY) {
    const names = [city.name, ...(city.aliases ?? [])].map((entry) => normalizeSegment(entry));
    if (names.includes(normalized)) {
      matches.push({ city: city.name, country: city.country });
    }
  }
  return matches;
}

export function findCityBySegment(segment: string): RegistryCityMatch | null {
  return findCitiesBySegment(segment)[0] ?? null;
}

export function findCityByZip(zip: string): { city: string; country: string } | null {
  for (const city of CITY_REGISTRY) {
    if (city.zips.includes(zip)) {
      return { city: city.name, country: city.country };
    }
  }
  return null;
}

export function hasStreetKeyword(segment: string): boolean {
  const normalized = normalizeSegment(segment);
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.some((word) => STREET_KEYWORDS.has(word));
}

export function parseStreetAndHouse(segment: string): {
  street: string | null;
  houseNumber: string | null;
  unit: string | null;
} {
  const cleaned = segment.replace(/[_]+/g, ' ').trim();
  const match = cleaned.match(
    /^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.'\-\s]+?)\s+(\d{1,4}[A-Za-z]?)(?:[\s,/-]+(Top\s*\d+|Stiege\s*[A-Za-z0-9]+|Tür\s*\d+|Unit\s*[A-Za-z0-9]+))?$/i,
  );

  if (!match) {
    return { street: null, houseNumber: null, unit: null };
  }

  return {
    street: (match[1] ?? '').trim() || null,
    houseNumber: (match[2] ?? '').trim() || null,
    unit: (match[3] ?? '').trim() || null,
  };
}

export function parseZipAndCity(segment: string): { zip: string | null; city: string | null } {
  const cleaned = segment.replace(/[_-]+/g, ' ').trim();
  const zipMatch = cleaned.match(/\b(\d{4,5})\b/);
  if (!zipMatch) {
    return { zip: null, city: null };
  }

  const zip = zipMatch[1];
  const rest = cleaned.replace(zipMatch[0], '').trim();
  return {
    zip,
    city: rest.length > 0 ? rest : null,
  };
}

export function formatAddressLine(
  street: string | null,
  houseNumber: string | null,
  city: string | null,
): string {
  const parts: string[] = [];
  if (street && houseNumber) {
    parts.push(`${street} ${houseNumber}`);
  } else if (street) {
    parts.push(street);
  }
  if (city) {
    parts.push(city);
  }
  return parts.join(', ').trim();
}
