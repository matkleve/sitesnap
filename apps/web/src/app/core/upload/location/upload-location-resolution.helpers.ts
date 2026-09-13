/**
 * Pure helpers for upload pre-upload location disambiguation.
 * @see docs/specs/service/media-upload-service/upload-location-resolution.md
 */

import type { GeocoderSearchResult } from '../../geocoding/geocoding.service';
import {
  uploadTraceDecision,
  uploadTraceEnter,
  uploadTraceExit,
} from '../address-resolution/upload-address-resolution.debug';
import type { UploadLocationConfig } from './upload-location-config';
import type {
  UploadAddressCandidate,
  UploadDiscriminatingField,
  UploadDisambiguationCollapseStage,
} from '../upload-manager.types';
import { haversineMeters } from '../../geo/haversine.util';
import {
  formatSearchObjectLabel,
} from '../../location-path-parser/upload-search-object.builder';
import {
  classifySearchObjectCompleteness,
  searchObjectHasLocality,
  type ProjectGeocodeCentroid,
} from '../../location-path-parser/upload-search-object.completeness.helpers';
import { normalizeAdminValue } from '../../location-path-parser/upload-area-evidence.helpers';
import type {
  UploadGroupResolutionState,
  UploadLocationRowHit,
  UploadSearchObject,
} from '../address-resolution/upload-address-resolution.types';
import { getExifMetadataCoords } from './upload-location-precedence.helpers';
import type { UploadJob } from '../upload-manager.types';
import type { ExifCoords } from '../upload.service';

export type ClassifySearchOutcome =
  | { kind: 'auto'; candidate: UploadAddressCandidate }
  | { kind: 'ambiguous'; candidates: UploadAddressCandidate[] }
  | { kind: 'failed' }
  | { kind: 'none' };

/** Parent folder path from a file relative path (excludes filename). */
export function deriveFolderDisplayPath(relativePath: string | undefined): string {
  if (!relativePath?.trim()) {
    return '';
  }
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(0, -1).join('/');
}

/** Normalize address text for stable group keys (OD-1). */
export function normalizeAddressForGrouping(address: string): string {
  return address
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Stable tray group key. Prefer Search Object `groupingKey`; legacy fallback uses title + folder.
 * @see docs/specs/service/media-upload-service/upload-search-object.md
 */
export function buildDisambiguationQueryKey(
  groupingKeyOrTitle: string,
  folderDisplayPath?: string,
): string {
  const key = groupingKeyOrTitle.trim().toLowerCase();
  if (!folderDisplayPath?.trim()) {
    return key;
  }
  return `${normalizeAddressForGrouping(groupingKeyOrTitle)}|${folderDisplayPath.toLowerCase()}`;
}

export function searchObjectToRpcParams(so: UploadSearchObject): Record<string, string | null> {
  return {
    p_street: so.street,
    p_house_number: so.houseNumber,
    p_staircase: so.staircase,
    p_door: so.door,
    p_postcode: so.postcode,
    p_city: so.city,
    p_district: null,
    p_country: so.country,
  };
}

export function locationRowToCandidate(row: UploadLocationRowHit): UploadAddressCandidate {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  const street = [row.street, row.house_number].filter(Boolean).join(' ');
  const city =
    row.postcode && row.city ? `${row.postcode} ${row.city}` : (row.city ?? row.postcode ?? '');
  const addressLabel = row.address_label?.trim() || (street && city ? `${street}, ${city}` : street || city || 'Address');
  return {
    id: `db-${row.id}`,
    addressLabel,
    lat,
    lng,
    city: row.city,
    postcode: row.postcode,
    score: 1,
  };
}

export function buildGroupPresentation(so: UploadSearchObject): {
  folderDisplayPath: string;
  titleAddressLabel: string;
} {
  return {
    folderDisplayPath: deriveFolderDisplayPath(so.relativePath),
    titleAddressLabel: formatSearchObjectLabel(so),
  };
}

export type LocalResolutionGate =
  | 'branch_a'
  | 'branch_b'
  | 'branch_c'
  | 'metadata_only'
  | 'postcode_blocked'
  | 'incomplete';

/**
 * EXIF GPS wins over Branch C tray when "street" is only a weak filename token (e.g. IMG from IMG_1121.jpg).
 * @see docs/specs/service/media-upload-service/upload-manager-pipeline.location-routing.supplement.md
 */
export function isExifAuthoritativeOverWeakFilenameStreet(
  groupState: UploadGroupResolutionState,
  findJob: (jobId: string) => UploadJob | undefined,
): boolean {
  const so = groupState.searchObject;
  uploadTraceEnter('weak-exif', 'isExifAuthoritativeOverWeakFilenameStreet', {
    geocodeBranch: groupState.geocodeBranch,
    trayStep: groupState.trayStep,
    street: so.street,
    city: so.city,
    houseNumber: so.houseNumber,
    folderDisplayPath: groupState.folderDisplayPath,
    jobIds: groupState.jobIds,
  });
  if (groupState.geocodeBranch !== 'branch_c' || groupState.trayStep !== '1a') {
    uploadTraceDecision('weak-exif', 'skip EXIF override — need branch_c and trayStep 1a', {
      geocodeBranch: groupState.geocodeBranch,
      trayStep: groupState.trayStep,
    });
    return false;
  }
  if (!so.street?.trim() || searchObjectHasLocality(so)) {
    uploadTraceDecision('weak-exif', 'skip — no street or SO already has locality', {
      street: so.street,
      city: so.city,
      postcode: so.postcode,
    });
    return false;
  }
  if (groupState.folderDisplayPath?.trim()) {
    uploadTraceDecision('weak-exif', 'skip — folder path present', {
      folderDisplayPath: groupState.folderDisplayPath,
    });
    return false;
  }
  const hasFolderAddressSource = so.sources.some(
    (entry) =>
      entry.source === 'folder' &&
      (entry.field === 'street' ||
        entry.field === 'houseNumber' ||
        entry.field === 'city' ||
        entry.field === 'postcode'),
  );
  if (hasFolderAddressSource) {
    uploadTraceDecision('weak-exif', 'skip — folder contributed address fields', {
      sources: so.sources.map((s) => `${s.source}:${s.field}`),
    });
    return false;
  }
  const streetSources = so.sources.filter(
    (entry) => entry.field === 'street' || entry.field === 'houseNumber',
  );
  if (
    streetSources.length > 0 &&
    !streetSources.every((entry) => entry.source === 'filename')
  ) {
    uploadTraceDecision('weak-exif', 'skip — street not filename-only', {
      streetSources: streetSources.map((s) => `${s.source}:${s.field}=${s.value}`),
    });
    return false;
  }
  const allHaveExif = groupState.jobIds.every((jobId) => {
    const job = findJob(jobId);
    return !!job && !!getExifMetadataCoords(job);
  });
  if (allHaveExif) {
    uploadTraceDecision('weak-exif', 'EXIF wins — weak filename street, all jobs have EXIF', {
      street: so.street,
      jobIds: groupState.jobIds,
    });
  } else {
    uploadTraceDecision('weak-exif', 'skip — not every job has EXIF metadata', {
      jobIds: groupState.jobIds,
    });
  }
  return allHaveExif;
}

/**
 * Classify SO completeness into a local resolution gate (branch_a/b/c, incomplete, postcode_blocked, metadata_only).
 * @see docs/specs/service/media-upload-service/upload-search-object.md § Completeness gates (Branch A/B/C)
 */
export function evaluateLocalResolution(
  so: UploadSearchObject,
  projectCentroid?: ProjectGeocodeCentroid | null,
): LocalResolutionGate {
  uploadTraceEnter('local-gate', 'evaluateLocalResolution', {
    country: so.country,
    street: so.street,
    houseNumber: so.houseNumber,
    city: so.city,
    postcode: so.postcode,
    groupingKey: so.groupingKey,
    hasProjectCentroid: !!projectCentroid,
  });
  if (so.postcodeCandidates.length > 1 && !so.city) {
    uploadTraceDecision('local-gate', 'postcode_blocked — multiple postcode candidates, no city', {
      postcodeCandidates: so.postcodeCandidates,
      city: so.city,
    });
    uploadTraceExit('local-gate', 'evaluateLocalResolution', 'postcode_blocked');
    return 'postcode_blocked';
  }
  const branch = classifySearchObjectCompleteness(so, projectCentroid);
  if (branch === 'incomplete') {
    uploadTraceDecision('local-gate', 'incomplete — SO missing required tiers for any branch', {
      street: so.street,
      city: so.city,
      houseNumber: so.houseNumber,
      country: so.country,
    });
    uploadTraceExit('local-gate', 'evaluateLocalResolution', 'incomplete');
    return 'incomplete';
  }
  uploadTraceDecision('local-gate', `gate = ${branch}`, {
    street: so.street,
    houseNumber: so.houseNumber,
    city: so.city,
    country: so.country,
    hasProjectCentroid: !!projectCentroid,
  });
  uploadTraceExit('local-gate', 'evaluateLocalResolution', branch);
  return branch;
}

/**
 * Optional locality hint from folder path only (OD-5 — no default city append).
 */
export function deriveLocalityHint(relativePath: string | undefined): string | undefined {
  const folder = deriveFolderDisplayPath(relativePath);
  if (!folder) {
    return undefined;
  }
  const last = folder.split('/').pop()?.trim();
  if (!last || last.length < 3 || /^\d+$/.test(last)) {
    return undefined;
  }
  return last;
}

/** Build search query; appends folder hint only when present. */
export function buildSearchQuery(titleAddress: string, localityHint?: string): string {
  const base = titleAddress.trim();
  if (!localityHint?.trim()) {
    return base;
  }
  const hint = localityHint.trim();
  if (base.toLowerCase().includes(hint.toLowerCase())) {
    return base;
  }
  return `${base}, ${hint}`;
}

const DISCRIMINATING_FIELD_ORDER: readonly UploadDiscriminatingField[] = [
  'city',
  'municipality',
  'district',
  'state',
  'postcode',
];

export function discriminatingFieldValue(
  candidate: UploadAddressCandidate,
  field: UploadDiscriminatingField,
): string {
  switch (field) {
    case 'city':
      return (candidate.city ?? '').trim();
    case 'municipality':
      return (candidate.municipality ?? '').trim();
    case 'district':
      return (candidate.district ?? '').trim();
    case 'state':
      return (candidate.state ?? '').trim();
    case 'postcode':
      return (candidate.postcode ?? '').trim();
    default:
      return '';
  }
}

/** Branch C 5a: first ranked field that differs between Photon candidates. */
export function pickDiscriminatingField(
  candidates: UploadAddressCandidate[],
): UploadDiscriminatingField | null {
  for (const field of DISCRIMINATING_FIELD_ORDER) {
    const values = new Set(
      candidates
        .map((c) => discriminatingFieldValue(c, field).toLowerCase())
        .filter(Boolean),
    );
    if (values.size > 1) {
      return field;
    }
  }
  return null;
}

export function mapGeocoderHitsToCandidates(hits: GeocoderSearchResult[]): UploadAddressCandidate[] {
  return hits.map((hit, index) => {
    const city =
      hit.address?.city ??
      hit.address?.town ??
      hit.address?.village ??
      null;
    const addr = hit.address as Record<string, string | undefined> | undefined;
    const municipality = hit.address?.municipality ?? addr?.['county'] ?? null;
    return {
      id: `cand-${index}-${hit.lat.toFixed(5)}-${hit.lng.toFixed(5)}`,
      addressLabel: hit.name?.trim() || hit.displayName,
      displayName: hit.displayName,
      lat: hit.lat,
      lng: hit.lng,
      city,
      municipality,
      district: hit.address?.suburb ?? hit.address?.city_district ?? null,
      state: addr?.['state'] ?? null,
      postcode: hit.address?.postcode ?? null,
      score: Math.min(1, Math.max(0, hit.importance)),
    };
  });
}

function pickExifAssistCandidate(
  candidates: UploadAddressCandidate[],
  exifCoords: ExifCoords,
  radiusMeters: number,
): UploadAddressCandidate | undefined {
  let best: UploadAddressCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = haversineMeters(
      exifCoords.lat,
      exifCoords.lng,
      candidate.lat,
      candidate.lng,
    );
    if (distance <= radiusMeters && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Drop Photon hits farther than org contextDistanceMaxMeters from anchor (EXIF → project centroid).
 * @see docs/specs/service/search/search-tuning.distance-radii-contract.md
 */
export function filterGeocodeHitsByContextDistance(
  hits: GeocoderSearchResult[],
  anchor: ExifCoords | undefined,
  projectCentroid: { lat: number; lng: number } | undefined,
  contextDistanceMaxMeters: number,
): GeocoderSearchResult[] {
  const point = anchor ?? projectCentroid;
  if (!point || contextDistanceMaxMeters <= 0) {
    return hits;
  }
  return hits.filter((h) => {
    const lat = Number(h.lat);
    const lng = Number(h.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }
    return haversineMeters(point.lat, point.lng, lat, lng) <= contextDistanceMaxMeters;
  });
}

/**
 * When SO has units and Photon returns multiple hits far apart, keep ambiguous tray.
 * @see docs/specs/service/media-upload-service/upload-search-object.md#photon-multi-hit-gate
 */
export function shouldSplitGroupByPhotonUnitCoords(
  searchObject: Pick<UploadSearchObject, 'staircase' | 'door'>,
  candidates: UploadAddressCandidate[],
  unitGeocodeSplitMinMeters: number,
): boolean {
  const hasUnit = !!(searchObject.staircase?.trim() || searchObject.door?.trim());
  if (!hasUnit || candidates.length < 2 || unitGeocodeSplitMinMeters <= 0) {
    return false;
  }
  let maxDist = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (dist > maxDist) {
        maxDist = dist;
      }
    }
  }
  return maxDist > unitGeocodeSplitMinMeters;
}

/** Candidate id prefix for CITY-01 EXIF reverse-geocode city option. */
export const BRANCH_C_EXIF_CITY_CANDIDATE_PREFIX = 'exif-city-';

/**
 * Build numbered city options for CITY-01: Photon auto city vs EXIF reverse-geocode city.
 * @see docs/specs/service/media-upload-service/upload-address-resolution.branch-c-city-tray.md#city-01
 */
export function buildBranchCCity01Candidates(
  autoCandidate: UploadAddressCandidate,
  exifReverseCity: string,
  exifCoords: ExifCoords,
): UploadAddressCandidate[] {
  const exifCity = exifReverseCity.trim();
  const exifCandidate: UploadAddressCandidate = {
    id: `${BRANCH_C_EXIF_CITY_CANDIDATE_PREFIX}${normalizeAdminValue(exifCity)}`,
    addressLabel: exifCity,
    lat: exifCoords.lat,
    lng: exifCoords.lng,
    city: exifCity,
  };
  return [autoCandidate, exifCandidate];
}

/**
 * Branch C auto-assign blocked — force city_step when EXIF reverse-geocode city disagrees with Photon auto city.
 * @see docs/specs/service/media-upload-service/upload-address-resolution.branch-c-city-tray.md#city-01
 */
export function shouldForceBranchCCityTray(
  group: Pick<UploadGroupResolutionState, 'geocodeBranch' | 'searchObject'>,
  outcome: ClassifySearchOutcome,
  exifReverseCity: string | null | undefined,
): boolean {
  if (group.geocodeBranch !== 'branch_c' || outcome.kind !== 'auto') {
    return false;
  }
  const so = group.searchObject;
  if (so.city?.trim() || so.houseNumber?.trim()) {
    return false;
  }
  const autoCity = outcome.candidate.city?.trim();
  if (!autoCity) {
    return false;
  }
  const exifCity = exifReverseCity?.trim();
  if (!exifCity) {
    return false;
  }
  return normalizeAdminValue(autoCity) !== normalizeAdminValue(exifCity);
}

/**
 * Classify forward-geocode hits for upload placement.
 *
 * Distance rules (do not conflate):
 * - `config.exifAssistRadiusMeters` (m): pick which candidate matches EXIF when several exist.
 * - Org `resolver.contextDistanceMaxMeters` (km in UI, m in DB): drop hits unrealistically far from
 *   job search anchor before classify — same as Search Tuning “Max distance for internet results”.
 *   **Wire-up:** filter hits using merged org config + anchor before this function runs.
 * @see docs/specs/service/search/search-tuning.distance-radii-contract.md
 */
export function classifySearchHits(
  hits: GeocoderSearchResult[],
  config: UploadLocationConfig,
  exifCoords?: ExifCoords,
): ClassifySearchOutcome {
  uploadTraceEnter('classify-hits', 'classifySearchHits', {
    hitCount: hits.length,
    exifCoords,
    exifAssistRadiusMeters: config.exifAssistRadiusMeters,
    minMeaningfulScore: config.minMeaningfulScore,
  });
  if (!hits.length) {
    uploadTraceDecision('classify-hits', 'failed — zero geocoder hits');
    uploadTraceExit('classify-hits', 'classifySearchHits', 'failed');
    return { kind: 'failed' };
  }

  const candidates = mapGeocoderHitsToCandidates(hits);
  if (exifCoords) {
    const assisted = pickExifAssistCandidate(
      candidates,
      exifCoords,
      config.exifAssistRadiusMeters,
    );
    if (assisted) {
      uploadTraceDecision('classify-hits', 'auto — EXIF within exifAssistRadiusMeters', {
        candidateId: assisted.id,
        addressLabel: assisted.addressLabel,
        radiusM: config.exifAssistRadiusMeters,
      });
      uploadTraceExit('classify-hits', 'classifySearchHits', 'auto (exif-assist)');
      return { kind: 'auto', candidate: assisted };
    }
    uploadTraceDecision('classify-hits', 'no EXIF-assist match within radius', {
      candidateCount: candidates.length,
      radiusM: config.exifAssistRadiusMeters,
    });
  }

  const sorted = [...candidates].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = sorted[0];
  const second = sorted[1];
  const topScore = top.score ?? 0;

  if (topScore < config.minMeaningfulScore) {
    uploadTraceDecision('classify-hits', 'failed — top score below minMeaningfulScore', {
      topScore,
      minMeaningfulScore: config.minMeaningfulScore,
      topLabel: top.addressLabel,
    });
    uploadTraceExit('classify-hits', 'classifySearchHits', 'failed');
    return { kind: 'failed' };
  }

  if (topScore >= config.disambiguationAutoAssignThreshold) {
    uploadTraceDecision('classify-hits', 'auto — top score >= disambiguationAutoAssignThreshold', {
      topScore,
      threshold: config.disambiguationAutoAssignThreshold,
      topLabel: top.addressLabel,
    });
    uploadTraceExit('classify-hits', 'classifySearchHits', 'auto');
    return { kind: 'auto', candidate: top };
  }

  if (
    sorted.length === 1 ||
    (second &&
      topScore - (second.score ?? 0) >= config.minTopGap &&
      topScore >= config.disambiguationReviewLowerBound)
  ) {
    uploadTraceDecision('classify-hits', 'auto — single hit or clear top gap', {
      hitCount: sorted.length,
      topScore,
      secondScore: second?.score,
      minTopGap: config.minTopGap,
      topLabel: top.addressLabel,
    });
    uploadTraceExit('classify-hits', 'classifySearchHits', 'auto');
    return { kind: 'auto', candidate: top };
  }

  if (sorted.length > 1 && topScore >= config.disambiguationReviewLowerBound) {
    uploadTraceDecision('classify-hits', 'ambiguous — multiple hits above review lower bound', {
      hitCount: sorted.length,
      topScore,
      reviewLowerBound: config.disambiguationReviewLowerBound,
    });
    uploadTraceExit('classify-hits', 'classifySearchHits', 'ambiguous');
    return { kind: 'ambiguous', candidates: sorted };
  }

  uploadTraceDecision('classify-hits', 'auto — fallback to top candidate', {
    topScore,
    topLabel: top.addressLabel,
  });
  uploadTraceExit('classify-hits', 'classifySearchHits', 'auto (fallback)');
  return { kind: 'auto', candidate: top };
}

/** Pick UI collapse stage from candidate spread (Branch C 5a ranking). */
export function pickCollapseStage(
  candidates: UploadAddressCandidate[],
  jobCount: number,
): UploadDisambiguationCollapseStage {
  const field = pickDiscriminatingField(candidates);
  if (field === 'city') {
    return 'city';
  }
  if (field) {
    return 'partial';
  }
  const labels = new Set(candidates.map((c) => c.addressLabel.trim().toLowerCase()));
  if (labels.size > 1) {
    return 'partial';
  }
  if (jobCount > 1) {
    return 'per_file';
  }
  return 'partial';
}

export function isGroupBlocked(group: {
  resolutionGateOpen: boolean;
  resolutionStatus: string;
}): boolean {
  return group.resolutionGateOpen && group.resolutionStatus === 'pending';
}

export function isJobBlocked(
  job: { disambiguationGroupId?: string; phase: string },
  groupsById: ReadonlyMap<string, { resolutionGateOpen: boolean; resolutionStatus: string }>,
): boolean {
  if (job.phase === 'awaiting_disambiguation') {
    return true;
  }
  if (!job.disambiguationGroupId) {
    return false;
  }
  const group = groupsById.get(job.disambiguationGroupId);
  return group ? isGroupBlocked(group) : false;
}
