/**
 * Search Object and batch resolution cache types for upload address pipeline.
 * @see docs/specs/service/media-upload-service/upload-search-object.md
 */

import type { AddressLayerEntry } from '../../location-path-parser/upload-search-object.layer-map';
import type {
  AreaConflict,
  FieldLevelEntry,
  AreaFieldKey,
  ValueOrigin,
} from './upload-area-evidence.types';
import type {
  UploadAddressCandidate,
  UploadDiscriminatingField,
  UploadTrayStep,
} from '../upload-manager.types';

export type UploadAddressFieldSource = 'folder' | 'filename';

export interface UploadAddressSourceEntry {
  field: string;
  value: string;
  source: UploadAddressFieldSource;
  confidence: number;
  uncertain?: boolean;
  /** `path` (default) or `derived`; see {@link ValueOrigin}. */
  origin?: ValueOrigin;
  /** Only when `origin` is `derived`: the rule that produced this value. */
  rule?: string;
}

export interface UploadAddressSourceDeviation {
  field: string;
  folderValue: string;
  filenameValue: string;
}

/**
 * How a Search Object's `country` got its value: read from a path token, or inferred from an exact
 * place match. Advisory — it gates no branch.
 * @see docs/specs/service/media-upload-service/upload-search-object.country-derivation.md
 */
export type CountryProvenance = 'parsed' | 'derived';

/** Leaf-level address extracted from relativePath + fileName (English field names). */
export interface UploadSearchObject {
  country: string | null;
  countryProvenance?: CountryProvenance | null;
  state: string | null;
  postcode: string | null;
  city: string | null;
  street: string | null;
  houseNumber: string | null;
  staircase: string | null;
  door: string | null;
  project: string | null;
  sources: UploadAddressSourceEntry[];
  sourceDeviations: UploadAddressSourceDeviation[];
  postcodeCandidates: string[];
  uncertainFields: string[];
  groupingKey: string;
  relativePath: string;
  fileName: string;
  areaEvidence?: Partial<Record<AreaFieldKey, FieldLevelEntry[]>>;
  areaConflicts?: AreaConflict[];
}

export type UploadGroupResolutionStatus =
  | 'resolved'
  | 'partial'
  | 'needsGeocode'
  | 'needsLayerResolution'
  | 'needsAreaResolution'
  | 'needsTray'
  | 'ambiguous';

export type UploadGeocodeBranch = 'branch_a' | 'branch_b' | 'branch_c' | 'metadata_only';

export interface UploadProjectCentroid {
  lat: number;
  lng: number;
  city?: string | null;
  zoom?: number;
}

export interface UploadLocationRowHit {
  id: string;
  latitude: number;
  longitude: number;
  street: string | null;
  house_number: string | null;
  postcode: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  address_label: string | null;
}

export interface UploadGroupResolutionState {
  status: UploadGroupResolutionStatus;
  groupingKey: string;
  jobIds: string[];
  searchObject: UploadSearchObject;
  folderDisplayPath: string;
  titleAddressLabel: string;
  geocodeBranch?: UploadGeocodeBranch;
  projectCentroid?: UploadProjectCentroid;
  trayStep?: UploadTrayStep;
  confirmedCity?: string | null;
  candidate?: UploadAddressCandidate;
  candidates?: UploadAddressCandidate[];
  discriminatingField?: UploadDiscriminatingField;
  /** Raw layer packages for audit — @see upload-search-object.layer-map.md */
  addressLayers?: AddressLayerEntry[];
  /** Tray merge key for layer_package groups. */
  layerConflictQueryKey?: string;
  /** Tray merge key for admin_level_conflict groups. */
  areaConflictQueryKey?: string;
  areaConflicts?: AreaConflict[];
  /** Set when this group was created by integrateResolvedAdminGroups.
   * Used to trigger a containment_check tray instead of silent partial on Photon 0-hit. */
  resolvedFromAdminConflict?: boolean;
  /** Photon 0-hit after admin resolution — open validation tray instead of silent partial. */
  containmentCheck?: boolean;
}
