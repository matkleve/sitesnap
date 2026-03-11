/**
 * MapFilterService — manages spatial/temporal filter state for the map viewport query.
 *
 * Separate from FilterService (workspace-pane client-side rule filters).
 * This service holds ActiveFilter entries that modify the viewport_markers RPC
 * parameters: time ranges, project constraints, radius/distance overlays.
 *
 * Ground rules:
 *  - Signals for all state; no RxJS.
 *  - One filter per type (except metadata — multiple allowed).
 *  - getChipLabel() provides human-readable chip text for ActiveFilterChips.
 */

import { Injectable, computed, signal } from '@angular/core';

// ── Filter type definitions ────────────────────────────────────────────────────

export type FilterType = 'time-range' | 'project' | 'metadata' | 'distance' | 'radius';

export interface TimeRangeFilter {
  type: 'time-range';
  from: string | null; // ISO date string
  to: string | null;
}

export interface ProjectFilter {
  type: 'project';
  projectId: string;
  projectName: string;
}

export interface MetadataFilter {
  type: 'metadata';
  keyId: string;
  keyName: string;
  value: string;
}

export interface DistanceFilter {
  type: 'distance';
  center: { lat: number; lng: number };
  maxMeters: number;
}

export interface RadiusFilter {
  type: 'radius';
  center: { lat: number; lng: number };
  radiusMeters: number;
}

export type ActiveFilter =
  | TimeRangeFilter
  | ProjectFilter
  | MetadataFilter
  | DistanceFilter
  | RadiusFilter;

/** Typed params passed to the viewport_markers RPC (subset of ActiveFilter state). */
export interface FilterQueryParams {
  capturedAfter?: string;
  capturedBefore?: string;
  projectId?: string;
  distanceCenter?: { lat: number; lng: number };
  distanceMaxMeters?: number;
  radiusCenter?: { lat: number; lng: number };
  radiusMeters?: number;
  metadataFilters?: { keyId: string; value: string }[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MapFilterService {
  // ── State ────────────────────────────────────────────────────────────────

  /** All active map-level filters. */
  readonly filters = signal<ActiveFilter[]>([]);

  readonly activeCount = computed(() => this.filters().length);
  readonly hasActiveFilters = computed(() => this.filters().length > 0);

  // ── Mutations ─────────────────────────────────────────────────────────────

  setTimeRange(from: string | null, to: string | null): void {
    this.upsertFilter({ type: 'time-range', from, to });
  }

  setProject(projectId: string, projectName: string): void {
    this.upsertFilter({ type: 'project', projectId, projectName });
  }

  addMetadataFilter(keyId: string, keyName: string, value: string): void {
    this.filters.update((f) => [...f, { type: 'metadata', keyId, keyName, value }]);
  }

  setDistance(center: { lat: number; lng: number }, maxMeters: number): void {
    this.upsertFilter({ type: 'distance', center, maxMeters });
  }

  setRadiusFilter(center: { lat: number; lng: number }, radiusMeters: number): void {
    this.upsertFilter({ type: 'radius', center, radiusMeters });
  }

  removeFilter(filter: ActiveFilter): void {
    this.filters.update((f) => f.filter((existing) => existing !== filter));
  }

  removeFilterByType(type: FilterType): void {
    this.filters.update((f) => f.filter((existing) => existing.type !== type));
  }

  clearAll(): void {
    this.filters.set([]);
  }

  // ── Query building ────────────────────────────────────────────────────────

  /** Builds RPC parameter object from the current filter set. */
  buildQueryParams(): FilterQueryParams {
    const filters = this.filters();
    const params: FilterQueryParams = {};

    for (const filter of filters) {
      switch (filter.type) {
        case 'time-range':
          if (filter.from) params.capturedAfter = filter.from;
          if (filter.to) params.capturedBefore = filter.to;
          break;
        case 'project':
          params.projectId = filter.projectId;
          break;
        case 'distance':
          params.distanceCenter = filter.center;
          params.distanceMaxMeters = filter.maxMeters;
          break;
        case 'radius':
          params.radiusCenter = filter.center;
          params.radiusMeters = filter.radiusMeters;
          break;
      }
    }

    params.metadataFilters = filters
      .filter((f): f is MetadataFilter => f.type === 'metadata')
      .map((f) => ({ keyId: f.keyId, value: f.value }));

    return params;
  }

  // ── Chip labels ───────────────────────────────────────────────────────────

  /** Returns a human-readable label for a filter chip (e.g. "Project: Building A"). */
  getChipLabel(filter: ActiveFilter): string {
    switch (filter.type) {
      case 'time-range':
        return `Date: ${filter.from ?? '…'} – ${filter.to ?? '…'}`;
      case 'project':
        return `Project: ${filter.projectName}`;
      case 'metadata':
        return `${filter.keyName}: ${filter.value}`;
      case 'distance':
        return `Within ${filter.maxMeters >= 1000 ? `${(filter.maxMeters / 1000).toFixed(1)} km` : `${Math.round(filter.maxMeters)} m`}`;
      case 'radius':
        return `Radius: ${filter.radiusMeters >= 1000 ? `${(filter.radiusMeters / 1000).toFixed(1)} km` : `${Math.round(filter.radiusMeters)} m`}`;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Replaces an existing filter of the same type, or appends if none exists. */
  private upsertFilter(filter: ActiveFilter): void {
    this.filters.update((f) => [
      ...f.filter((existing) => existing.type !== filter.type),
      filter,
    ]);
  }
}
