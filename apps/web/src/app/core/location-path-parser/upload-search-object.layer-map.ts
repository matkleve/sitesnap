/**
 * Layer package model — competing path interpretations before flat Search Object.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md
 */

import type { GemeindeRecord, PlzMap } from './local-geo-data.adapter';
import type { BundeslandRecord } from './local-geo-data.adapter';
import {
  buildGroupingKey,
  dropAddressWithoutStreet,
  buildSearchObjectFromRelativePath,
  expandPostcodeOnSearchObject,
} from './upload-search-object.builder';
import { collapseAtSlashPathSegments } from './upload-search-object.unit-parsing.at';
import { foldStreetSpelling, splitPathSegments, stripFileExtension } from './location-path-parser.util';
import type { UploadSearchObject } from '../upload/address-resolution/upload-address-resolution.types';

/** Same normalization as grouping keys — kept local to avoid parser → upload cycle. */
function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Filename layer key constant — normative in layer-map spec. */
export const FILENAME_LAYER_KEY = '__filename__';

/** Street-level fields carried per layer package (SO uses staircase for unit/door). */
export interface StreetLevelParsed {
  street?: string | null;
  houseNumber?: string | null;
  staircase?: string | null;
  door?: string | null;
}

/** One path interpretation before flat SO collapse. */
export interface AddressLayerEntry {
  layerKey: string;
  source: 'folder' | 'filename';
  parsed: StreetLevelParsed;
}

export interface PackageConflictResult {
  /** Entries that participate in at least one value mismatch. */
  conflictingEntries: AddressLayerEntry[];
  /** Stable tray / cache merge key. */
  layerConflictQueryKey: string;
}

export interface LayerResolutionResult {
  layers: AddressLayerEntry[];
  searchObject: UploadSearchObject;
  packageConflict: PackageConflictResult | null;
}

const STREET_LEVEL_KEYS: (keyof StreetLevelParsed)[] = [
  'street',
  'houseNumber',
  'staircase',
  'door',
];

/** Normalize segment text for layerKey paths. */
export function normalizeLayerKeySegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .normalize('NFC');
}

/** Normalize a street-level field value for compare, folding street-name spellings. */
export function normalizeStreetLevelValue(value: string | null | undefined): string {
  if (value == null) {
    return '';
  }
  return foldStreetSpelling(normalizeKeyPart(value));
}

/**
 * A package is an address, and an address needs a street: a lone house number or unit describes a
 * position on a street nobody named.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
function hasAnyStreetLevel(parsed: StreetLevelParsed): boolean {
  return !!parsed.street?.trim();
}

/**
 * Filename tokens like IMG_1274 must not form a street-level package.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.examples.md#ex-08
 */
export function isWeakFilenameStreetLevel(parsed: StreetLevelParsed, fileName: string): boolean {
  const base = stripFileExtension(fileName).trim();
  if (/^img_\d+$/i.test(base)) {
    return true;
  }
  const street = parsed.street?.trim().toLowerCase() ?? '';
  if (!street && !parsed.houseNumber?.trim()) {
    return true;
  }
  return street === 'img' || street === 'file';
}

function extractStreetLevel(so: UploadSearchObject): StreetLevelParsed {
  return {
    street: so.street,
    houseNumber: so.houseNumber,
    staircase: so.staircase,
    door: so.door,
  };
}

function folderSegmentsFromPath(relativePath: string, fileName: string): string[] {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const segments = collapseAtSlashPathSegments(splitPathSegments(normalizedPath));
  if (segments.length > 0 && segments[segments.length - 1] === fileName) {
    return segments.slice(0, -1);
  }
  return segments.filter((s) => s !== fileName);
}

function buildFolderLayerKey(folderSegments: string[], index: number): string {
  return folderSegments
    .slice(0, index + 1)
    .map(normalizeLayerKeySegment)
    .join('/');
}

/**
 * Build one AddressLayerEntry per folder prefix and optional filename package.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#layerkey-format
 */
export function buildAddressLayers(
  relativePath: string,
  fileName: string,
  geo: { states: BundeslandRecord[]; municipalities: GemeindeRecord[] },
): AddressLayerEntry[] {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const folderSegments = folderSegmentsFromPath(normalizedPath, fileName);
  const fileBase = stripFileExtension(fileName);
  const geoInput = { states: geo.states, municipalities: geo.municipalities };
  const entries: AddressLayerEntry[] = [];

  for (let i = 0; i < folderSegments.length; i++) {
    const prefixPath = folderSegments.slice(0, i + 1).join('/');
    const so = buildSearchObjectFromRelativePath(prefixPath, '', geoInput);
    const parsed = extractStreetLevel(so);
    if (hasAnyStreetLevel(parsed)) {
      entries.push({
        layerKey: buildFolderLayerKey(folderSegments, i),
        source: 'folder',
        parsed,
      });
    }
  }

  if (fileBase) {
    const filenameSo = buildSearchObjectFromRelativePath(fileName, fileName, geoInput);
    const parsed = extractStreetLevel(filenameSo);
    if (hasAnyStreetLevel(parsed) && !isWeakFilenameStreetLevel(parsed, fileName)) {
      entries.push({
        layerKey: FILENAME_LAYER_KEY,
        source: 'filename',
        parsed,
      });
    }
  }

  return entries;
}

function entriesConflict(a: AddressLayerEntry, b: AddressLayerEntry): boolean {
  if (!hasAnyStreetLevel(a.parsed) || !hasAnyStreetLevel(b.parsed)) {
    return false;
  }
  for (const key of STREET_LEVEL_KEYS) {
    const av = a.parsed[key]?.trim();
    const bv = b.parsed[key]?.trim();
    if (av && bv && normalizeStreetLevelValue(av) !== normalizeStreetLevelValue(bv)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect competing packages; returns conflicting entries and stable query key.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#package-conflict-detection
 */
export function detectPackageConflicts(
  layers: AddressLayerEntry[],
  folderDisplayPath: string,
): PackageConflictResult | null {
  const withStreet = layers.filter((e) => hasAnyStreetLevel(e.parsed));
  if (withStreet.length < 2) {
    return null;
  }

  const conflicting = new Set<AddressLayerEntry>();
  for (let i = 0; i < withStreet.length; i++) {
    for (let j = i + 1; j < withStreet.length; j++) {
      if (entriesConflict(withStreet[i], withStreet[j])) {
        conflicting.add(withStreet[i]);
        conflicting.add(withStreet[j]);
      }
    }
  }

  if (conflicting.size < 2) {
    return null;
  }

  const list = [...conflicting];
  const signature = list
    .map((e) => `${e.layerKey}:${formatPackageLabel(e)}`)
    .sort()
    .join('|');
  const folderPart = normalizeKeyPart(folderDisplayPath || 'root');
  const layerConflictQueryKey = `layer|${folderPart}|${normalizeKeyPart(signature)}`;

  return { conflictingEntries: list, layerConflictQueryKey };
}

/** Human-readable package label for tray options. */
export function formatPackageLabel(entry: AddressLayerEntry): string {
  const parts = [
    entry.parsed.street,
    entry.parsed.houseNumber,
    entry.parsed.staircase,
    entry.parsed.door,
  ].filter((p) => !!p?.trim());
  const summary = parts.join(' ').trim() || entry.layerKey;
  if (entry.source === 'filename') {
    return `Filename: ${summary}`;
  }
  return `Folder: ${summary}`;
}

/**
 * Merge street-level fields when no conflict (merge + enrich rules).
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#merge-rules
 */
export function mergeLayersWithoutConflict(layers: AddressLayerEntry[]): StreetLevelParsed {
  const result: StreetLevelParsed = {};
  for (const key of STREET_LEVEL_KEYS) {
    const values = layers
      .map((e) => e.parsed[key]?.trim())
      .filter((v): v is string => !!v);
    if (!values.length) {
      continue;
    }
    const distinct = new Set(values.map((v) => normalizeStreetLevelValue(v)));
    if (distinct.size === 1) {
      result[key] = values[0];
    }
  }
  return result;
}

/**
 * Administrative fields from full path — independent of package tray choice.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.md#administrative-vs-street-level
 */
export function resolveAdministrativeContext(
  relativePath: string,
  fileName: string,
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
    postcodeMap: PlzMap;
  },
): Pick<
  UploadSearchObject,
  | 'country'
  | 'state'
  | 'postcode'
  | 'city'
  | 'postcodeCandidates'
  | 'sources'
  | 'adminLevelMap'
  | 'adminLevelConflicts'
> {
  const so = buildSearchObjectFromRelativePath(relativePath, fileName, {
    states: geo.states,
    municipalities: geo.municipalities,
    postcodeMap: geo.postcodeMap,
  });
  const expanded = expandPostcodeOnSearchObject(so, geo.postcodeMap);
  return {
    country: expanded.country,
    state: expanded.state,
    postcode: expanded.postcode,
    city: expanded.city,
    postcodeCandidates: expanded.postcodeCandidates,
    sources: expanded.sources,
    adminLevelMap: so.adminLevelMap,
    adminLevelConflicts: so.adminLevelConflicts,
  };
}

/**
 * Apply chosen layer package (Option A) — street-level from that entry only.
 * @see docs/specs/service/media-upload-service/upload-search-object.layer-map.examples.md#ex-03
 */
export function resolveSOWithChosenLayer(
  layers: AddressLayerEntry[],
  chosenLayerKey: string,
  relativePath: string,
  fileName: string,
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
    postcodeMap: PlzMap;
  },
): UploadSearchObject {
  const chosen = layers.find((e) => e.layerKey === chosenLayerKey);
  const streetLevel: StreetLevelParsed = chosen
    ? {
        street: chosen.parsed.street ?? null,
        houseNumber: chosen.parsed.houseNumber ?? null,
        staircase: chosen.parsed.staircase ?? null,
        door: chosen.parsed.door ?? null,
      }
    : mergeLayersWithoutConflict(layers);

  return assembleFlatSearchObject(relativePath, fileName, geo, streetLevel);
}

function assembleFlatSearchObject(
  relativePath: string,
  fileName: string,
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
    postcodeMap: PlzMap;
  },
  streetLevel: StreetLevelParsed,
): UploadSearchObject {
  const admin = resolveAdministrativeContext(relativePath, fileName, geo);
  const fields = dropAddressWithoutStreet({
    country: admin.country,
    state: admin.state,
    postcode: admin.postcode,
    city: admin.city,
    street: streetLevel.street ?? null,
    houseNumber: streetLevel.houseNumber ?? null,
    staircase: streetLevel.staircase ?? null,
    door: streetLevel.door ?? null,
    project: null as string | null,
  });
  return {
    ...fields,
    sources: admin.sources,
    sourceDeviations: [],
    postcodeCandidates: admin.postcodeCandidates,
    uncertainFields: [],
    groupingKey: buildGroupingKey(fields),
    relativePath: relativePath.replace(/\\/g, '/'),
    fileName,
    adminLevelMap: admin.adminLevelMap,
    adminLevelConflicts: admin.adminLevelConflicts,
  };
}

/**
 * Build flat SO from layers without tray (auto-merge path).
 */
export function buildFlatSearchObjectFromLayers(
  layers: AddressLayerEntry[],
  relativePath: string,
  fileName: string,
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
    postcodeMap: PlzMap;
  },
): UploadSearchObject {
  const streetLevel = mergeLayersWithoutConflict(layers);
  return assembleFlatSearchObject(relativePath, fileName, geo, streetLevel);
}

/**
 * Full layer pipeline for one job at classifyBatch.
 */
export function resolveLayersForJob(
  relativePath: string,
  fileName: string,
  geo: {
    states: BundeslandRecord[];
    municipalities: GemeindeRecord[];
    postcodeMap: PlzMap;
  },
  folderDisplayPath: string,
): LayerResolutionResult {
  const layers = buildAddressLayers(relativePath, fileName, geo);
  const packageConflict = detectPackageConflicts(layers, folderDisplayPath);
  if (packageConflict) {
    const searchObject = buildFlatSearchObjectFromLayers(layers, relativePath, fileName, geo);
    return { layers, searchObject, packageConflict };
  }
  const searchObject = buildFlatSearchObjectFromLayers(layers, relativePath, fileName, geo);
  return { layers, searchObject, packageConflict: null };
}

/** Tray candidate id — prefixed layerKey (slashes safe in ids). */
export function layerKeyToCandidateId(layerKey: string): string {
  return `layer-pkg|${layerKey}`;
}
