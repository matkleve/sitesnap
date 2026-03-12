import { GeocoderSearchResult } from '../geocoding.service';

// ── Scoring ────────────────────────────────────────────────────────────────

export function computeTextMatchScore(label: string, query: string): number {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedLabel || !normalizedQuery) return 0;

  if (normalizedLabel === normalizedQuery) return 1;
  if (normalizedLabel.startsWith(normalizedQuery)) return 0.92;
  if (normalizedLabel.includes(normalizedQuery)) return 0.8;

  const sharedTokens = normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => normalizedLabel.includes(token)).length;

  return Math.min(0.79, sharedTokens * 0.2);
}

// ── Address Formatting ─────────────────────────────────────────────────────

export function formatGeocoderAddressLabel(result: GeocoderSearchResult): string {
  const addr = result.address;
  if (!addr) return truncateDisplayName(result.displayName);

  const city = addr.city || addr.town || addr.village || addr.municipality;
  const parts = buildAddressParts(addr.road, addr.house_number, addr.postcode, city);
  return parts || truncateDisplayName(result.displayName);
}

function buildAddressParts(
  street?: string,
  number?: string,
  postcode?: string,
  city?: string,
): string | null {
  const streetPart = street ? (number ? `${street} ${number}` : street) : null;
  const cityPart = postcode && city ? `${postcode} ${city}` : city || null;

  if (streetPart && cityPart) return `${streetPart}, ${cityPart}`;
  if (streetPart) return streetPart;
  return cityPart;
}

function truncateDisplayName(displayName: string): string {
  return displayName.length > 60 ? displayName.slice(0, 60) + '…' : displayName;
}

export function formatDbAddressLabel(
  rawLabel: string,
  street: string | null,
  city: string | null,
): string {
  if (street && city) return `${street}, ${city}`;
  if (street) return street;
  if (city) return city;
  return rawLabel;
}

// ── Query Normalization ────────────────────────────────────────────────────

export function normalizeSearchQuery(query: string): string {
  return applyStreetTokenCorrections(
    query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function buildFallbackQueries(normalizedQuery: string): string[] {
  const candidates = new Set<string>();
  const correctedFull = applyStreetTokenCorrections(normalizedQuery);
  addIfDistinct(candidates, correctedFull, normalizedQuery);

  const base = correctedFull || normalizedQuery;
  const streetOnly = base.replace(/\s+\d+[a-zA-Z]?\s*$/, '').trim();
  addIfDistinct(candidates, streetOnly, normalizedQuery, correctedFull);

  const correctedStreetOnly = applyStreetTokenCorrections(streetOnly);
  addIfDistinct(candidates, correctedStreetOnly, normalizedQuery, correctedFull, streetOnly);

  return [...candidates];
}

function addIfDistinct(set: Set<string>, value: string, ...exclude: string[]): void {
  if (value && !exclude.includes(value)) set.add(value);
}

function applyStreetTokenCorrections(query: string): string {
  return query
    .split(' ')
    .map((token) => correctStreetToken(token))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUFFIX_REPLACEMENTS: [string, string][] = [
  ['strassee', 'strasse'],
  ['strase', 'strasse'],
  ['stras', 'strasse'],
  ['str.', 'strasse'],
  ['str', 'strasse'],
  ['gase', 'gasse'],
  ['gass', 'gasse'],
  ['gas', 'gasse'],
];

function correctStreetToken(token: string): string {
  if (!token) return token;

  if (token === 'g' || token === 'g.') return 'gasse';
  if (token === 'str' || token === 'str.') return 'strasse';

  for (const [suffix, replacement] of SUFFIX_REPLACEMENTS) {
    if (token.endsWith(suffix)) {
      return token.slice(0, -suffix.length) + replacement;
    }
  }
  return token;
}

// ── Type Coercion ──────────────────────────────────────────────────────────

export function toNumber(value: number | string | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
