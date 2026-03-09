import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { FilterService } from './filter.service';
import type {
  WorkspaceImage,
  GroupedSection,
  SortConfig,
  PropertyRef,
} from './workspace-view.types';

const DEFAULT_SORT: SortConfig = { key: 'captured_at', direction: 'desc' };

@Injectable({ providedIn: 'root' })
export class WorkspaceViewService {
  private readonly supabase = inject(SupabaseService);
  private readonly filterService = inject(FilterService);

  // ── Input signals ────────────────────────────────────────────────────────

  readonly rawImages = signal<WorkspaceImage[]>([]);
  readonly selectedProjectIds = signal<Set<string>>(new Set());
  readonly activeSort = signal<SortConfig>(DEFAULT_SORT);
  readonly activeGroupings = signal<PropertyRef[]>([]);
  readonly collapsedGroups = signal<Set<string>>(new Set());
  readonly isLoading = signal(false);
  /** True once a marker click triggers a load — distinguishes "no selection" from "empty result". */
  readonly selectionActive = signal(false);

  // ── Pipeline: computed signal chain ──────────────────────────────────────

  /** Step 1: Filter by project. Empty set = no filter (all projects). */
  private readonly projectFiltered = computed(() => {
    const images = this.rawImages();
    const projectIds = this.selectedProjectIds();
    if (projectIds.size === 0) return images;
    return images.filter((img) => img.projectId && projectIds.has(img.projectId));
  });

  /** Step 2: Apply filter rules from FilterService. */
  private readonly ruleFiltered = computed(() => {
    const images = this.projectFiltered();
    const rules = this.filterService.rules();
    if (rules.length === 0) return images;
    return images.filter((img) => this.filterService.matchesClientSide(img, rules));
  });

  /** Step 3: Sort. */
  private readonly sorted = computed(() => {
    const images = [...this.ruleFiltered()];
    const sort = this.activeSort();
    return images.sort((a, b) => {
      const valA = this.getSortValue(a, sort.key);
      const valB = this.getSortValue(b, sort.key);
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  });

  /** Step 4: Group by active groupings (multi-level). */
  readonly groupedSections = computed<GroupedSection[]>(() => {
    const images = this.sorted();
    const groupings = this.activeGroupings();
    if (groupings.length === 0) {
      return [{ heading: '', headingLevel: 0, imageCount: images.length, images }];
    }
    return this.buildGroups(images, groupings, 0);
  });

  /** Total count after all filters applied. */
  readonly totalImageCount = computed(() => this.ruleFiltered().length);

  // ── Public API ───────────────────────────────────────────────────────────

  /** Monotonic counter to discard stale RPC responses on rapid marker clicks. */
  private clusterLoadId = 0;

  /** Load images for a cluster click via the cluster_images RPC. */
  async loadClusterImages(clusterLat: number, clusterLng: number, zoom: number): Promise<void> {
    const requestId = ++this.clusterLoadId;
    this.selectionActive.set(true);
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('cluster_images', {
        p_cluster_lat: clusterLat,
        p_cluster_lng: clusterLng,
        p_zoom: zoom,
      });
      // Discard if a newer request has been fired while this one was in-flight.
      if (requestId !== this.clusterLoadId) return;

      if (error || !data || (data as RawClusterRow[]).length === 0) {
        // No images found — show the empty selection state.
        this.rawImages.set([]);
        return;
      }
      this.rawImages.set((data as RawClusterRow[]).map(mapClusterRow));
    } finally {
      // Only clear loading if this is still the active request.
      if (requestId === this.clusterLoadId) {
        this.isLoading.set(false);
      }
    }
  }

  /** Set images directly (e.g. from a radius selection). */
  setActiveSelectionImages(images: WorkspaceImage[]): void {
    this.selectionActive.set(true);
    this.rawImages.set(images);
  }

  /** Convenience: "select" state populated but holding zero rows (RPC returned nothing). */
  readonly emptySelection = computed(
    () => this.selectionActive() && !this.isLoading() && this.rawImages().length === 0,
  );

  /** Clear active selection data only — preserves toolbar settings (sort, filters, project, grouping). */
  clearActiveSelection(): void {
    this.rawImages.set([]);
    this.selectionActive.set(false);
    this.collapsedGroups.set(new Set());
  }

  /** Clear active selection AND reset all toolbar settings to defaults. */
  clearActiveSelectionAndSettings(): void {
    this.rawImages.set([]);
    this.selectionActive.set(false);
    this.selectedProjectIds.set(new Set());
    this.filterService.clearAll();
    this.activeSort.set(DEFAULT_SORT);
    this.activeGroupings.set([]);
    this.collapsedGroups.set(new Set());
  }

  toggleGroupCollapsed(groupKey: string): void {
    this.collapsedGroups.update((set) => {
      const next = new Set(set);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  /** Batch-sign thumbnail URLs for a set of images. */
  async batchSignThumbnails(images: WorkspaceImage[]): Promise<void> {
    const unsigned = images.filter((img) => !img.signedThumbnailUrl && img.thumbnailPath);
    if (unsigned.length === 0) return;

    const paths = unsigned.map((img) => img.thumbnailPath!);
    const { data, error } = await this.supabase.client.storage
      .from('images')
      .createSignedUrls(paths, 3600);

    if (error || !data) return;

    // Update images in-place and re-emit the signal.
    const urlMap = new Map<string, string>();
    for (const item of data) {
      if (item.signedUrl) {
        urlMap.set(item.path!, item.signedUrl);
      }
    }

    this.rawImages.update((all) =>
      all.map((img) => {
        const url = img.thumbnailPath ? urlMap.get(img.thumbnailPath) : undefined;
        return url ? { ...img, signedThumbnailUrl: url } : img;
      }),
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private getSortValue(img: WorkspaceImage, key: string): string | number | null {
    switch (key) {
      case 'captured_at':
      case 'date-captured':
        return img.capturedAt;
      case 'created_at':
      case 'date-uploaded':
        return img.createdAt;
      case 'name':
        return img.storagePath;
      case 'project':
        return img.projectName;
      default:
        return img.capturedAt;
    }
  }

  private getGroupValue(img: WorkspaceImage, propertyId: string): string {
    switch (propertyId) {
      case 'project':
        return img.projectName ?? 'No project';
      case 'date': {
        if (!img.capturedAt) return 'No date';
        return new Date(img.capturedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      case 'city':
      case 'address':
      case 'country':
        return 'Unknown';
      default:
        return 'Unknown';
    }
  }

  private buildGroups(
    images: WorkspaceImage[],
    groupings: PropertyRef[],
    level: number,
  ): GroupedSection[] {
    if (groupings.length === 0) {
      return [{ heading: '', headingLevel: level, imageCount: images.length, images }];
    }

    const [current, ...rest] = groupings;
    const buckets = new Map<string, WorkspaceImage[]>();

    for (const img of images) {
      const key = this.getGroupValue(img, current.id);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(img);
      } else {
        buckets.set(key, [img]);
      }
    }

    const sections: GroupedSection[] = [];
    for (const [heading, groupImages] of buckets) {
      const section: GroupedSection = {
        heading,
        headingLevel: level,
        imageCount: groupImages.length,
        images: rest.length === 0 ? groupImages : [],
      };
      if (rest.length > 0) {
        section.subGroups = this.buildGroups(groupImages, rest, level + 1);
        section.imageCount = groupImages.length;
      }
      sections.push(section);
    }

    return sections;
  }
}

// ── RPC row mapping ──────────────────────────────────────────────────────────

interface RawClusterRow {
  image_id: string;
  latitude: number;
  longitude: number;
  thumbnail_path: string | null;
  storage_path: string;
  captured_at: string | null;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
  direction: number | null;
  exif_latitude: number | null;
  exif_longitude: number | null;
  address_label: string | null;
}

function mapClusterRow(row: RawClusterRow): WorkspaceImage {
  return {
    id: row.image_id,
    latitude: row.latitude,
    longitude: row.longitude,
    thumbnailPath: row.thumbnail_path,
    storagePath: row.storage_path,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    projectId: row.project_id,
    projectName: row.project_name,
    direction: row.direction,
    exifLatitude: row.exif_latitude,
    exifLongitude: row.exif_longitude,
    addressLabel: row.address_label,
  };
}
