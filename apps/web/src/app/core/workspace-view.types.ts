/**
 * Shared types for the Workspace View system.
 * Used by WorkspaceViewService, FilterService, toolbar components, and the grid.
 */

/** An image record as returned by the cluster_images RPC. */
export interface WorkspaceImage {
  id: string;
  latitude: number;
  longitude: number;
  thumbnailPath: string | null;
  storagePath: string;
  capturedAt: string | null;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  direction: number | null;
  exifLatitude: number | null;
  exifLongitude: number | null;
  addressLabel: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  country: string | null;
  userName: string | null;
  /** Signed thumbnail URL — populated lazily by batch signing. */
  signedThumbnailUrl?: string;
  /** True when batch signing was attempted but no URL could be produced. */
  thumbnailUnavailable?: boolean;
  /** Custom property values — maps metadata_key UUID → stored value. */
  metadata?: Record<string, string>;
}

/** A grouped section of images, produced by the WorkspaceViewService pipeline. */
export interface GroupedSection {
  heading: string;
  headingLevel: number;
  imageCount: number;
  images: WorkspaceImage[];
  subGroups?: GroupedSection[];
}

/** Sort configuration: which property to sort by and in what direction. */
export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

/** A reference to a property used for grouping. */
export interface PropertyRef {
  id: string;
  label: string;
  icon: string;
}

/** A Notion-style filter rule. */
export interface FilterRule {
  id: string;
  conjunction: 'where' | 'and' | 'or';
  property: string;
  operator: string;
  value: string;
}
