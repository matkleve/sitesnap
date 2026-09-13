/**
 * Builds UploadSearchObject from relativePath + fileName.
 * @see docs/specs/service/media-upload-service/upload-search-object.md
 */

import type {
  UploadAddressSourceDeviation,
  UploadAddressSourceEntry,
  UploadSearchObject,
} from '../upload/address-resolution/upload-address-resolution.types';
import type {
  AdminFieldKey,
  FieldLevelEntry,
} from '../upload/address-resolution/upload-address-level-map.types';
import {
  collapseAdminFlatFields,
  detectAdminLevelConflicts,
} from './upload-address-level-map.helpers';
import type { GemeindeRecord, PlzMap } from './local-geo-data.adapter';
import {
  classifyTokensInSegment,
  isUncertainConfidence,
  tokenizeSegment,
  type ClassifiedToken,
  type TokenClassificationContext,
} from './path-token-classifier';
import { splitPathSegments, stripFileExtension } from './location-path-parser.util';
import type { BundeslandRecord } from './local-geo-data.adapter';
import {
  collapseAtSlashPathSegments,
  parseAtSegmentUnits,
} from './upload-search-object.unit-parsing.at';
import type { AtSegmentUnitParse } from './upload-search-object.unit-parsing.at';
import { normalizeCountryCode } from './postcode-patterns';

type SoFields = Pick<
  UploadSearchObject,
  | 'country'
  | 'state'
  | 'postcode'
  | 'city'
  | 'street'
  | 'houseNumber'
  | 'staircase'
  | 'door'
  | 'project'
>;

function emptyFields(): SoFields {
  return {
    country: null,
    state: null,
    postcode: null,
    city: null,
    street: null,
    houseNumber: null,
    staircase: null,
    door: null,
    project: null,
  };
}

function fieldKeyForKind(kind: ClassifiedToken['kind']): keyof SoFields | null {
  switch (kind) {
    case 'postcode':
      return 'postcode';
    case 'houseNumber':
      return 'houseNumber';
    case 'staircase':
      return 'staircase';
    case 'door':
      return 'door';
    case 'project':
      return 'project';
    case 'country':
      return 'country';
    case 'state':
      return 'state';
    case 'city':
      return 'city';
    case 'street':
      return 'street';
    default:
      return null;
  }
}

const ADMIN_FIELD_KEYS: AdminFieldKey[] = ['country', 'state', 'city', 'postcode'];

/** Street-level kinds — the ones that make a filename an address rather than a camera label. */
const STREET_LEVEL_KINDS = new Set<ClassifiedToken['kind']>([
  'street',
  'houseNumber',
  'staircase',
  'door',
]);
/** The fallback classifier emits `street` at 0.5 for any leftover word, so 0.5 proves nothing. */
const STREET_LEVEL_MIN_CONFIDENCE = 0.9;

/** A purely numeric admin token — i.e. a postcode. Names (`Graz`, `AT`) are never gated. */
const NUMERIC_ADMIN_TOKEN_RE = /^\d+$/;

/**
 * May a filename segment write a **numeric** admin field — in practice, a postcode?
 *
 * Only when that same filename also yields a street-level token at real confidence. Without this,
 * `IMG_1274.jpg` under `AT/Wien/1090/…` classifies `1274` as a postcode (pass 2: the country is
 * known and the token matches AT's four-digit pattern) and then wins the flat collapse, because the
 * filename is level 0 — so the stored postcode is 1274, two photos of one building land in
 * different groups, and a tray opens for a path that was never ambiguous.
 *
 * Named admin tokens are deliberately **not** gated: a camera writes `IMG_1274.jpg`, never
 * `Graz.jpg`, so `Graz.jpg` under `AT/Wien/` still contributes its city.
 *
 * @see docs/specs/service/media-upload-service/upload-search-object.md § Admin level map
 * @see docs/study/005-upload-pipeline-trace-findings.md F-01
 */
/**
 * A camera label's number contributes nothing — not the flat value, not the source entry, not the
 * level-0 map entry that would otherwise win the collapse.
 */
function isGatedFilenameAdminToken(
  key: string,
  token: ClassifiedToken,
  allowNumericAdminFields: boolean,
): boolean {
  if (allowNumericAdminFields || !ADMIN_FIELD_KEYS.includes(key as AdminFieldKey)) {
    return false;
  }
  return NUMERIC_ADMIN_TOKEN_RE.test(token.value);
}

/**
 * May a filename segment write address fields at all?
 *
 * Only when it carries a street of its own. `Wilhelminenstr 141/IMG_1.jpg` otherwise lets the camera
 * counter `1` override the folder's house number 141, which is [F-01](../../../../docs/study/005-upload-pipeline-trace-findings.md)
 * on the address side. Explicit unit keywords (`Stiege`, `Tür`, `Top`) come from the unit parser and
 * are not affected.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
function filenameMayWriteAddressFields(classified: ClassifiedToken[]): boolean {
  return classified.some(
    (token) => token.kind === 'street' && token.confidence >= STREET_LEVEL_MIN_CONFIDENCE,
  );
}

function filenameMayWriteNumericAdminFields(
  classified: ClassifiedToken[],
  units: AtSegmentUnitParse,
): boolean {
  if (units.staircase || units.door) {
    return true;
  }
  return classified.some(
    (token) =>
      STREET_LEVEL_KINDS.has(token.kind) && token.confidence >= STREET_LEVEL_MIN_CONFIDENCE,
  );
}

function applyTokenToFields(
  fields: SoFields,
  token: ClassifiedToken,
  source: 'folder' | 'filename',
  sources: UploadAddressSourceEntry[],
  uncertainFields: Set<string>,
  filenameOverride: boolean,
  deviations: UploadAddressSourceDeviation[],
  level: number,
  adminLevelMap: Partial<Record<AdminFieldKey, FieldLevelEntry[]>>,
  allowNumericAdminFields: boolean,
  allowAddressFields: boolean,
  previousFolderValue?: string,
): void {
  const key = fieldKeyForKind(token.kind);
  if (!key) {
    return;
  }

  // A leftover word scores 0.5 as a street candidate. It stays in `sources` as evidence — a tray may
  // still show it — but it never becomes the flat street, and so never concatenates onto a real one.
  // @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
  const weakStreet = key === 'street' && token.confidence < STREET_LEVEL_MIN_CONFIDENCE;
  if (!mayTokenWriteField(key, token, weakStreet, allowAddressFields, allowNumericAdminFields)) {
    return;
  }

  if (filenameOverride && previousFolderValue != null && previousFolderValue !== token.value) {
    deviations.push({
      field: key,
      folderValue: previousFolderValue,
      filenameValue: token.value,
    });
  }

  if (!weakStreet) {
    writeFieldValue(fields, key, token.value);
  }

  sources.push({
    field: key,
    value: token.value,
    source,
    confidence: token.confidence,
    uncertain: isUncertainConfidence(token.confidence),
  });

  if (isUncertainConfidence(token.confidence)) {
    uncertainFields.add(key);
  }

  recordAdminLevelEntry(adminLevelMap, key, token.value, level, source);
}

/** Street fragments of one real street join; every other field is replaced. */
function writeFieldValue(fields: SoFields, key: keyof SoFields, value: string): void {
  if (key === 'street' && fields.street) {
    fields.street = `${fields.street} ${value}`.trim();
    return;
  }
  fields[key] = value;
}

function recordAdminLevelEntry(
  adminLevelMap: Partial<Record<AdminFieldKey, FieldLevelEntry[]>>,
  key: keyof SoFields,
  value: string,
  level: number,
  source: 'folder' | 'filename',
): void {
  if (!ADMIN_FIELD_KEYS.includes(key as AdminFieldKey) || !value) {
    return;
  }
  const adminKey = key as AdminFieldKey;
  const bucket = adminLevelMap[adminKey] ?? [];
  bucket.push({ level, value, source, field: adminKey });
  adminLevelMap[adminKey] = bucket;
}

/** The three gates a classified token passes before it may write anything. */
function mayTokenWriteField(
  key: keyof SoFields,
  token: ClassifiedToken,
  weakStreet: boolean,
  allowAddressFields: boolean,
  allowNumericAdminFields: boolean,
): boolean {
  if (token.confidence < STREET_LEVEL_MIN_CONFIDENCE && !weakStreet) {
    return false;
  }
  if (!allowAddressFields && STREET_LEVEL_KINDS.has(token.kind)) {
    return false;
  }
  return !isGatedFilenameAdminToken(key, token, allowNumericAdminFields);
}

function applyPresetUnits(
  fields: SoFields,
  preset: { houseNumber?: string | null; staircase?: string | null; door?: string | null },
  source: 'folder' | 'filename',
  sources: UploadAddressSourceEntry[],
): void {
  if (preset.houseNumber?.trim()) {
    fields.houseNumber = preset.houseNumber.trim();
    sources.push({
      field: 'houseNumber',
      value: preset.houseNumber.trim(),
      source,
      confidence: 1,
    });
  }
  if (preset.staircase?.trim()) {
    fields.staircase = preset.staircase.trim();
    sources.push({
      field: 'staircase',
      value: preset.staircase.trim(),
      source,
      confidence: 1,
    });
  }
  if (preset.door?.trim()) {
    fields.door = preset.door.trim();
    sources.push({
      field: 'door',
      value: preset.door.trim(),
      source,
      confidence: 1,
    });
  }
}

function applySegment(
  fields: SoFields,
  segment: string,
  source: 'folder' | 'filename',
  geo: { states: BundeslandRecord[]; municipalities: GemeindeRecord[] },
  context: TokenClassificationContext,
  sources: UploadAddressSourceEntry[],
  uncertainFields: Set<string>,
  deviations: UploadAddressSourceDeviation[],
  filenameOverride: boolean,
  level: number,
  adminLevelMap: Partial<Record<AdminFieldKey, FieldLevelEntry[]>>,
): void {
  const countryCode = normalizeCountryCode(context.country);
  const atUnits = parseAtSegmentUnits(segment, countryCode);
  applyPresetUnits(fields, atUnits, source, sources);
  const tokens = tokenizeSegment(atUnits.workingSegment);
  const classified = classifyTokensInSegment(tokens, geo, context, atUnits.workingSegment);
  const allowNumericAdminFields =
    source === 'folder' || filenameMayWriteNumericAdminFields(classified, atUnits);
  const allowAddressFields = source === 'folder' || filenameMayWriteAddressFields(classified);
  const folderSnapshot = filenameOverride ? { ...fields } : undefined;

  for (const token of classified) {
    const key = fieldKeyForKind(token.kind);
    const prev =
      filenameOverride && key ? (folderSnapshot?.[key] as string | null | undefined) : undefined;
    applyTokenToFields(
      fields,
      token,
      source,
      sources,
      uncertainFields,
      filenameOverride,
      deviations,
      level,
      adminLevelMap,
      allowNumericAdminFields,
      allowAddressFields,
      prev ?? undefined,
    );
    if (token.kind === 'country') {
      context.country = token.value;
    }
  }
}

/**
 * True when the SO has no anchor fields (city, zip, postcode, high-confidence street).
 * Prevents garbage filenames (e.g. "CV Matthias Kleveta ERP DE.pdf") from
 * being wired onto jobs as if they were real addresses.
 * @see path-token-classifier.ts — fallback classifier emits street at 0.5
 */
export function isSearchObjectMeaningless(so: UploadSearchObject): boolean {
  if (so.city || so.postcode) {
    return false;
  }
  if (!so.street) {
    return true;
  }
  const streetSources = so.sources.filter((s) => s.field === 'street');
  const hasHighConfidenceStreet = streetSources.some((s) => s.confidence >= 0.9);
  return !hasHighConfidenceStreet;
}

/**
 * `houseNumber`, `staircase` and `door` describe a position **on a street**. Without a street they are
 * not an address — and a stray number that reaches the grouping key groups unrelated files, which is
 * how `Baustelle Süd/Woche 12` ended up sharing a key with every other `12` in a batch.
 * @see docs/specs/service/media-upload-service/upload-search-object.evidence-model.md
 */
export function dropAddressWithoutStreet<T extends Pick<SoFields, 'street' | 'houseNumber' | 'staircase' | 'door'>>(
  fields: T,
): T {
  if (fields.street?.trim()) {
    return fields;
  }
  fields.houseNumber = null;
  fields.staircase = null;
  fields.door = null;
  return fields;
}

export function buildGroupingKey(fields: SoFields): string {
  const norm = (v: string | null | undefined): string =>
    (v ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '');
  return [
    norm(fields.country),
    norm(fields.state),
    norm(fields.postcode),
    norm(fields.city),
    norm(fields.street),
    norm(fields.houseNumber),
  ].join('|');
}

export function expandPostcodeOnSearchObject(
  so: UploadSearchObject,
  postcodeMap: PlzMap,
): UploadSearchObject {
  if (!so.postcode || so.city) {
    return so;
  }
  const cities = postcodeMap[so.postcode];
  if (!cities?.length) {
    return so;
  }
  if (cities.length === 1) {
    return {
      ...so,
      city: cities[0],
      postcodeCandidates: [],
      sources: [
        ...so.sources,
        {
          field: 'city',
          value: cities[0],
          source: 'folder',
          confidence: 1,
        },
      ],
      groupingKey: buildGroupingKey({ ...so, city: cities[0] }),
    };
  }
  return {
    ...so,
    postcodeCandidates: [...cities],
  };
}

export function isSearchObjectComplete(so: UploadSearchObject): boolean {
  const hasLocality = !!(so.city?.trim() || so.postcode?.trim());
  const hasStreet = !!so.street?.trim();
  return hasLocality && hasStreet;
}

export function formatSearchObjectLabel(so: UploadSearchObject): string {
  const streetPart = [so.street, so.houseNumber].filter(Boolean).join(' ');
  const cityPart =
    so.postcode && so.city ? `${so.postcode} ${so.city}` : (so.city ?? so.postcode ?? '');
  if (streetPart && cityPart) {
    return `${streetPart}, ${cityPart}`;
  }
  return streetPart || cityPart || so.fileName;
}

export interface BuildSearchObjectGeo {
  states: BundeslandRecord[];
  municipalities: GemeindeRecord[];
  postcodeMap?: PlzMap;
}

export function buildSearchObjectFromRelativePath(
  relativePath: string,
  fileName: string,
  geo: BuildSearchObjectGeo,
): UploadSearchObject {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const segments = collapseAtSlashPathSegments(splitPathSegments(normalizedPath));
  const fileBase = stripFileExtension(fileName);
  const folderSegments =
    segments.length > 0 && segments[segments.length - 1] === fileName
      ? segments.slice(0, -1)
      : segments.filter((s) => s !== fileName);

  const fields = emptyFields();
  const sources: UploadAddressSourceEntry[] = [];
  const deviations: UploadAddressSourceDeviation[] = [];
  const uncertainFields = new Set<string>();
  const adminLevelMap: Partial<Record<AdminFieldKey, FieldLevelEntry[]>> = {};
  const context: TokenClassificationContext = { country: null };

  for (let segIdx = 0; segIdx < folderSegments.length; segIdx++) {
    const level = folderSegments.length - segIdx;
    applySegment(
      fields,
      folderSegments[segIdx],
      'folder',
      geo,
      context,
      sources,
      uncertainFields,
      deviations,
      false,
      level,
      adminLevelMap,
    );
  }

  if (fileBase) {
    applySegment(
      fields,
      fileBase,
      'filename',
      geo,
      context,
      sources,
      uncertainFields,
      deviations,
      true,
      0,
      adminLevelMap,
    );
  }

  const adminLevelConflicts = detectAdminLevelConflicts(adminLevelMap, {
    municipalities: geo.municipalities,
    postcodeMap: geo.postcodeMap,
    country: fields.country ?? context.country,
  });

  collapseAdminFlatFields(fields, adminLevelMap);
  dropAddressWithoutStreet(fields);

  const groupingKey = buildGroupingKey(fields);

  return {
    ...fields,
    countryProvenance: context.countryProvenance ?? null,
    sources,
    sourceDeviations: deviations,
    postcodeCandidates: [],
    uncertainFields: [...uncertainFields],
    groupingKey,
    relativePath: normalizedPath,
    fileName,
    adminLevelMap,
    adminLevelConflicts,
  };
}
