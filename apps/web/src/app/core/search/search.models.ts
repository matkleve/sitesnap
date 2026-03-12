export type SearchState =
  | 'idle'
  | 'focused-empty'
  | 'typing'
  | 'results-partial'
  | 'results-complete'
  | 'committed';

export type SearchResultFamily = 'db-address' | 'db-content' | 'geocoder' | 'command' | 'recent';

export type SearchContentType = 'photo' | 'group' | 'project' | 'metadata';

export interface SearchQueryContext {
  organizationId?: string;
  activeProjectId?: string;
  viewportBounds?: {
    north: number;
    east: number;
    south: number;
    west: number;
  };
  dataCentroid?: { lat: number; lng: number };
  countryCodes?: string[];
  activeFilterCount?: number;
  commandMode?: boolean;
  selectedGroupId?: string;
}

export interface SearchBaseCandidate {
  id: string;
  label: string;
  secondaryLabel?: string;
  family: SearchResultFamily;
  score?: number;
}

export interface SearchAddressCandidate extends SearchBaseCandidate {
  family: 'db-address' | 'geocoder';
  lat: number;
  lng: number;
  confidence?: 'exact' | 'closest' | 'approximate';
  imageCount?: number;
}

export interface SearchContentCandidate extends SearchBaseCandidate {
  family: 'db-content';
  contentType: SearchContentType;
  contentId: string;
  subtitle?: string;
}

export interface SearchCommandCandidate extends SearchBaseCandidate {
  family: 'command';
  command: 'upload' | 'clear-filters' | 'go-to-location' | 'open-group';
  payload?: string;
}

export interface SearchRecentCandidate extends SearchBaseCandidate {
  family: 'recent';
  lastUsedAt: string;
  projectId?: string;
}

export type SearchCandidate =
  | SearchAddressCandidate
  | SearchContentCandidate
  | SearchCommandCandidate
  | SearchRecentCandidate;

export interface SearchSection {
  family: SearchResultFamily;
  title: string;
  items: SearchCandidate[];
  loading?: boolean;
}

export interface SearchResultSet {
  query: string;
  state: SearchState;
  sections: SearchSection[];
  empty: boolean;
}

export type SearchCommitAction =
  | {
      type: 'map-center';
      query: string;
      lat: number;
      lng: number;
    }
  | {
      type: 'open-content';
      query: string;
      contentType: SearchContentType;
      contentId: string;
    }
  | {
      type: 'run-command';
      query: string;
      command: SearchCommandCandidate['command'];
      payload?: string;
    }
  | {
      type: 'recent-selected';
      query: string;
      label: string;
    };

export interface SearchOrchestratorOptions {
  debounceMs: number;
  cacheTtlMs: number;
  recentMaxItems: number;
  geocoderDedupMeters: number;
}

export const DEFAULT_SEARCH_ORCHESTRATOR_OPTIONS: SearchOrchestratorOptions = {
  debounceMs: 300,
  cacheTtlMs: 5 * 60 * 1000,
  recentMaxItems: 8,
  geocoderDedupMeters: 30,
};
