/**
 * Token classification for upload Search Object building.
 * Two-pass per segment: text tokens first (country before postcode), numeric tokens last.
 * @see docs/specs/service/media-upload-service/upload-search-object.md
 */

import Fuse from 'fuse.js';
import type { BundeslandRecord, GemeindeRecord } from './local-geo-data.adapter';
import { COUNTRY_NAMES } from './city-registry.const';
import { isPostcodeToken, normalizeCountryCode } from './postcode-patterns';
import { findCitiesBySegment, isNoiseSegment, normalizeSegment } from './location-path-parser.util';
import type { CountryProvenance } from '../upload/address-resolution/upload-address-resolution.types';

export type ClassifiedTokenKind =
  | 'postcode'
  | 'houseNumber'
  | 'staircase'
  | 'door'
  | 'project'
  | 'country'
  | 'state'
  | 'city'
  | 'street';

export interface ClassifiedToken {
  raw: string;
  kind: ClassifiedTokenKind;
  value: string;
  confidence: number;
  /** Only on a `country` token: the code was inferred from a place, not read from the path. */
  derived?: boolean;
}

export interface TokenClassificationContext {
  country: string | null;
  /** How `country` got its value. Set by this classifier; read by the SO builder. */
  countryProvenance?: CountryProvenance | null;
}

const HOUSE_NUMBER_RE = /^\d{1,4}[a-zA-Z]?$/;
const STIEGE_RE = /^(stiege?|stg)/i;
const DOOR_RE = /^(tür|top)/i;
const PROJEKT_RE = /^projekt[:\s]/i;

const UNCERTAIN_LOW = 0.9;

/**
 * Any leftover word becomes a street candidate at this score, which proves nothing on its own.
 * Below `UNCERTAIN_LOW`, so it never reaches the flat `street` or an address package.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
const WEAK_STREET_CONFIDENCE = 0.5;

/** A street read only from standing next to a house number: real, but inferred from adjacency. */
const ADJACENT_STREET_CONFIDENCE = 0.95;

/**
 * Words a camera or a file manager puts in front of a counter. `IMG_1` has a number beside a word
 * and is still not an address, so these are never promoted by adjacency.
 */
const CAMERA_LABELS = new Set([
  'img',
  'image',
  'dsc',
  'dscn',
  'foto',
  'fotos',
  'photo',
  'file',
  'bild',
  'scan',
  'pic',
  'pict',
  'kopie',
  'copy',
  'export',
]);

/** `str`/`str.` is the everyday abbreviation of `straße` and appears in real folder names. */
const STREET_SUFFIX_RE = /(?:straße|strasse|str\.?|gasse|weg|platz|ring|allee|gürtel|zeile|steig)$/i;

const STREET_KEYWORDS = new Set([
  'straße',
  'gasse',
  'weg',
  'platz',
  'ring',
  'allee',
  'gürtel',
  'zeile',
  'steig',
]);

/** Numeric tokens are classified after country/city/street tokens in the same segment. */
function isDeferredNumericToken(token: string): boolean {
  return /^\d+[a-zA-Z]?$/i.test(token);
}

function fuseConfidence(fuseScore: number | undefined): number {
  if (fuseScore == null || !Number.isFinite(fuseScore)) {
    return 0;
  }
  return Math.max(0, Math.min(1, 1 - fuseScore));
}

function classifyCountry(token: string): ClassifiedToken | null {
  const normalized = normalizeSegment(token);
  for (const [code, aliases] of Object.entries(COUNTRY_NAMES)) {
    if (aliases.includes(normalized) || normalized === code.toLowerCase()) {
      return { raw: token, kind: 'country', value: code, confidence: 1 };
    }
  }
  return null;
}

/**
 * Exact name/alias index per dataset, keyed by the array itself so it is built once rather than
 * once per token. Memoizing matters twice: correctness (an exact hit must beat a fuzzy one) and
 * cost (classification is ~9 ms/file, dominated by this lookup).
 * @see docs/study/005-upload-pipeline-trace-findings.md F-02, F-06
 */
const exactIndexCache = new WeakMap<object, Map<string, string>>();

function exactIndexFor<T extends { n: string; a?: string[] }>(items: T[]): Map<string, string> {
  const cached = exactIndexCache.get(items);
  if (cached) {
    return cached;
  }
  const index = new Map<string, string>();
  for (const item of items) {
    for (const name of [item.n, ...(item.a ?? [])]) {
      const key = normalizeSegment(name);
      if (key && !index.has(key)) {
        index.set(key, item.n);
      }
    }
  }
  exactIndexCache.set(items, index);
  return index;
}

/** Minimum length difference tolerated before a fuzzy hit is treated as a different place. */
const FUZZY_LENGTH_SLACK = 2;
/** Above that, allow a quarter of the token's length. */
const FUZZY_LENGTH_RATIO = 0.25;

/**
 * Is a fuzzy candidate close enough in length to be the same place?
 *
 * A token the gazetteer does not contain otherwise substitutes a longer entry that contains it:
 * `Wien` matches `Schottwien` at 0.992, above the write threshold, so Austria's largest city was
 * stored as a Semmering village. A gap must fail visibly instead of resolving to a neighbour.
 */
function isPlausibleFuzzyLength(token: string, candidate: string): boolean {
  const bound = Math.max(FUZZY_LENGTH_SLACK, Math.ceil(token.length * FUZZY_LENGTH_RATIO));
  return Math.abs(candidate.length - token.length) <= bound;
}

function classifyWithFuse<T extends { n: string; a?: string[] }>(
  token: string,
  items: T[],
  kind: 'state' | 'city',
): ClassifiedToken | null {
  if (!items.length) {
    return null;
  }

  const exact = exactIndexFor(items).get(normalizeSegment(token));
  if (exact) {
    return { raw: token, kind, value: exact, confidence: 1 };
  }

  const fuse = new Fuse(items, {
    keys: [
      { name: 'n', weight: 0.7 },
      { name: 'a', weight: 0.3 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  });
  const results = fuse.search(token);
  const top = results[0];
  if (!top?.item) {
    return null;
  }
  const confidence = fuseConfidence(top.score);
  if (confidence < UNCERTAIN_LOW) {
    return null;
  }
  if (!isPlausibleFuzzyLength(token, top.item.n)) {
    return null;
  }
  return {
    raw: token,
    kind,
    value: top.item.n,
    confidence,
  };
}

/** The only country whose state / municipality gazetteers ship with the app. */
const AT_COUNTRY = 'AT';

interface ExactPlaceHits {
  tokens: ClassifiedToken[];
  /** The country each hit implies. More than one entry means the token is ambiguous. */
  countries: Set<string>;
}

/**
 * Exact name/alias hits for one token, across the country-carrying city registry and — when the
 * country is unset or AT — the AT gazetteers.
 * @see docs/specs/service/media-upload-service/upload-search-object.country-derivation.md
 */
function exactPlaceHits(
  token: string,
  geo: { states: BundeslandRecord[]; municipalities: GemeindeRecord[] },
  currentCountry: string | null,
): ExactPlaceHits {
  const tokens: ClassifiedToken[] = [];
  const countries = new Set<string>();
  const seen = new Set<string>();
  const push = (kind: 'state' | 'city', value: string, country: string): void => {
    // Count the country even when the value repeats: two registries spelling one place identically
    // still disagree about where it is, and that disagreement is what suppresses derivation.
    countries.add(country);
    const key = `${kind}:${value}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    tokens.push({ raw: token, kind, value, confidence: 1 });
  };

  for (const hit of findCitiesBySegment(token)) {
    // A registry row from another country is not this path's place; leave it to street text.
    if (!currentCountry || hit.country === currentCountry) {
      push('city', hit.city, hit.country);
    }
  }

  if (!currentCountry || currentCountry === AT_COUNTRY) {
    const normalized = normalizeSegment(token);
    const state = exactIndexFor(geo.states).get(normalized);
    if (state) {
      push('state', state, AT_COUNTRY);
    }
    const city = exactIndexFor(geo.municipalities).get(normalized);
    if (city) {
      push('city', city, AT_COUNTRY);
    }
  }

  return { tokens, countries };
}

/**
 * State / city for one token, deriving the country from an exact match when the path never said it.
 *
 * Folder paths rarely name the country (`Mödling/Wilhelminenstraße 141/…`), so requiring one before
 * consulting a gazetteer left every such address as street text. Fuzzy matching stays gated on AT:
 * a near miss in one country's gazetteer is not evidence of that country.
 */
function classifyPlaceToken(
  token: string,
  geo: { states: BundeslandRecord[]; municipalities: GemeindeRecord[] },
  context: TokenClassificationContext,
): ClassifiedToken[] {
  const currentCountry = normalizeCountryCode(context.country);
  const exact = exactPlaceHits(token, geo, currentCountry);

  if (exact.tokens.length) {
    // Two countries claim the same name: keep both places so the level map carries both values and
    // the admin-level tray asks, but derive nothing. Ambiguity is surfaced, never guessed.
    if (currentCountry || exact.countries.size > 1) {
      return exact.tokens;
    }
    const [derivedCountry] = [...exact.countries];
    context.country = derivedCountry;
    context.countryProvenance = 'derived';
    return [
      ...exact.tokens,
      { raw: token, kind: 'country', value: derivedCountry, confidence: 1, derived: true },
    ];
  }

  if (currentCountry !== AT_COUNTRY) {
    return [];
  }

  const fuzzy: ClassifiedToken[] = [];
  const state = classifyWithFuse(token, geo.states, 'state');
  if (state) {
    fuzzy.push(state);
  }
  const city = classifyWithFuse(token, geo.municipalities, 'city');
  if (city) {
    fuzzy.push(city);
  }
  return fuzzy;
}

function classifyNonNumericToken(
  token: string,
  geo: { states: BundeslandRecord[]; municipalities: GemeindeRecord[] },
  context: TokenClassificationContext,
): ClassifiedToken[] {
  if (PROJEKT_RE.test(token)) {
    return [{ raw: token, kind: 'project', value: token, confidence: 1 }];
  }
  if (DOOR_RE.test(token)) {
    return [{ raw: token, kind: 'door', value: token, confidence: 1 }];
  }
  if (STIEGE_RE.test(token)) {
    return [{ raw: token, kind: 'staircase', value: token, confidence: 1 }];
  }

  if (STREET_SUFFIX_RE.test(token)) {
    return [{ raw: token, kind: 'street', value: token, confidence: 1 }];
  }

  const country = classifyCountry(token);
  if (country) {
    context.country = country.value;
    context.countryProvenance = 'parsed';
    return [country];
  }

  const places = classifyPlaceToken(token, geo, context);
  if (places.length) {
    return places;
  }

  if (token.length >= 2) {
    return [
      {
        raw: token,
        kind: 'street',
        value: token,
        confidence: WEAK_STREET_CONFIDENCE,
      },
    ];
  }

  return [];
}

/**
 * House numbers only when country is known, or short tokens (1–3 digits) when country is not.
 * Avoids treating a 4-digit postcode-shaped token as a house number before country is set.
 */
function isHouseNumberToken(token: string, countryCode: string | null): boolean {
  if (countryCode) {
    return HOUSE_NUMBER_RE.test(token);
  }
  return /^\d{1,3}[a-zA-Z]?$/.test(token);
}

function classifyNumericToken(
  token: string,
  context: TokenClassificationContext,
): ClassifiedToken | null {
  if (isPostcodeToken(token, context.country)) {
    return { raw: token, kind: 'postcode', value: token, confidence: 1 };
  }

  if (isHouseNumberToken(token, context.country)) {
    return { raw: token, kind: 'houseNumber', value: token, confidence: 1 };
  }

  return null;
}

export function tokenizeSegment(segment: string): string[] {
  return segment
    .split(/[\s\-_. ,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function classifyTokensInSegment(
  tokens: string[],
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
  },
  context: TokenClassificationContext,
  /** The segment these tokens came from — needed to reject a noise segment as a street. */
  segmentText = '',
): ClassifiedToken[] {
  const classified: ClassifiedToken[] = [];

  const deferredNumeric: string[] = [];
  const nonNumeric: string[] = [];

  for (const token of tokens) {
    if (isDeferredNumericToken(token)) {
      deferredNumeric.push(token);
    } else {
      nonNumeric.push(token);
    }
  }

  const mergedNonNumeric: string[] = [];
  let mergeIndex = 0;
  while (mergeIndex < nonNumeric.length) {
    const current = nonNumeric[mergeIndex];
    const next = nonNumeric[mergeIndex + 1];
    if (next && STREET_KEYWORDS.has(next.toLowerCase())) {
      mergedNonNumeric.push(`${current} ${next}`);
      mergeIndex += 2;
    } else {
      mergedNonNumeric.push(current);
      mergeIndex += 1;
    }
  }

  for (const token of mergedNonNumeric) {
    const hits = classifyNonNumericToken(token, geo, context);
    classified.push(...hits);
  }

  for (const token of deferredNumeric) {
    const hit = classifyNumericToken(token, context);
    if (hit) {
      classified.push(hit);
    }
  }

  promoteStreetBesideHouseNumber(classified, segmentText);

  return classified;
}

/**
 * `Am Graben 12` is an address even though no token carries a street suffix: the house number beside
 * it is the evidence. One weak candidate plus one house number in a segment that is not noise
 * therefore becomes a real street. `Woche 12` does not, because `Woche` is a noise segment.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
function promoteStreetBesideHouseNumber(classified: ClassifiedToken[], segmentText: string): void {
  if (!classified.some((token) => token.kind === 'houseNumber')) {
    return;
  }
  const weak = classified.filter(
    (token) => token.kind === 'street' && token.confidence < UNCERTAIN_LOW,
  );
  if (weak.length !== 1 || isNoiseSegment(segmentText)) {
    return;
  }
  if (CAMERA_LABELS.has(normalizeSegment(weak[0].value))) {
    return;
  }
  weak[0].confidence = ADJACENT_STREET_CONFIDENCE;
}

export function isAcceptedConfidence(confidence: number): boolean {
  return confidence >= 0.98;
}

export function isUncertainConfidence(confidence: number): boolean {
  return confidence >= UNCERTAIN_LOW && confidence < 0.98;
}
