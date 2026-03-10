/**
 * LocationResolverService — resolves missing GPS ↔ address data for images.
 *
 * Two modes of operation:
 *  1. **On-demand**: called when images are loaded (marker click, radius selection).
 *     Checks each image for missing fields and resolves immediately.
 *  2. **Background batch**: started once after auth init, works through ALL
 *     unresolved images in the organization at ~1 request/second (Nominatim rate limit).
 *
 * Resolution directions:
 *  - GPS → Address: reverse geocode via Nominatim when lat/lng exist but address fields are missing.
 *  - Address → GPS: forward geocode via Nominatim when address_label exists but lat/lng are missing.
 *
 * Each unique GPS coordinate gets its own reverse geocode call — no clustering.
 */

import { Injectable, inject } from '@angular/core';
import { GeocodingService, type ReverseGeocodeResult } from './geocoding.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { WorkspaceImage } from './workspace-view.types';

const BATCH_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class LocationResolverService {
  private readonly geocoding = inject(GeocodingService);
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Image IDs currently being resolved (prevents duplicate work). */
  private readonly pending = new Set<string>();

  /** Whether the background batch is currently running. */
  private backgroundRunning = false;

  // ── On-demand resolution (marker click / radius selection) ─────────────

  /**
   * Resolve missing location data for a set of loaded images.
   * Called by WorkspaceViewService when images are loaded into the workspace.
   * Updates the DB; returns a map of image ID → resolved address for UI patching.
   */
  async resolveOnDemand(images: WorkspaceImage[]): Promise<Map<string, ReverseGeocodeResult>> {
    const results = new Map<string, ReverseGeocodeResult>();

    const { needsReverse, needsForward } = this.classifyImages(images);

    // Mark all as pending
    for (const img of [...needsReverse, ...needsForward]) {
      this.pending.add(img.id);
    }

    await this.resolveReverseGroup(needsReverse, results);
    await this.resolveForwardGroup(needsForward);

    return results;
  }

  /** Classify images into those needing reverse vs forward geocoding. */
  private classifyImages(images: WorkspaceImage[]): {
    needsReverse: WorkspaceImage[];
    needsForward: WorkspaceImage[];
  } {
    const needsReverse = images.filter(
      (img) =>
        img.latitude != null &&
        img.longitude != null &&
        this.isMissingAddress(img) &&
        !this.pending.has(img.id),
    );
    const needsForward = images.filter(
      (img) =>
        img.latitude == null &&
        img.longitude == null &&
        img.addressLabel != null &&
        !this.pending.has(img.id),
    );
    return { needsReverse, needsForward };
  }

  /** Reverse-geocode a group of images, grouped by exact GPS. */
  private async resolveReverseGroup(
    images: WorkspaceImage[],
    results: Map<string, ReverseGeocodeResult>,
  ): Promise<void> {
    const byLocation = new Map<string, WorkspaceImage[]>();
    for (const img of images) {
      const key = `${img.latitude},${img.longitude}`;
      const group = byLocation.get(key);
      if (group) group.push(img);
      else byLocation.set(key, [img]);
    }

    for (const [, group] of byLocation) {
      const rep = group[0];
      try {
        const result = await this.geocoding.reverse(rep.latitude, rep.longitude);
        if (!result) continue;

        const ids = group.map((img) => img.id);
        await this.persistAddress(ids, result);
        for (const id of ids) results.set(id, result);
      } catch {
        // Non-critical — will retry next load
      } finally {
        for (const img of group) this.pending.delete(img.id);
      }
    }
  }

  /** Forward-geocode a group of images that have address but no GPS. */
  private async resolveForwardGroup(images: WorkspaceImage[]): Promise<void> {
    for (const img of images) {
      try {
        const result = await this.geocoding.forward(img.addressLabel!);
        if (!result) continue;

        await this.persistGpsAndAddress(img.id, result.lat, result.lng, {
          addressLabel: result.addressLabel,
          city: result.city,
          district: result.district,
          street: result.street,
          country: result.country,
        });
      } catch {
        // Non-critical
      } finally {
        this.pending.delete(img.id);
      }
    }
  }

  // ── Background batch resolution ────────────────────────────────────────

  /**
   * Start resolving all unresolved images in the organization.
   * Runs in the background, processing one image at a time (~1 req/sec).
   * Safe to call multiple times — only one instance runs at a time.
   */
  async startBackgroundResolution(): Promise<void> {
    if (this.backgroundRunning) return;
    if (!this.auth.user()) return;

    this.backgroundRunning = true;
    console.log('[LocationResolver] Background resolution started');

    try {
      let totalResolved = 0;
      let hasMore = true;

      while (hasMore && this.backgroundRunning && this.auth.user()) {
        hasMore = false;
        const resolved = await this.processNextBatch();
        if (resolved > 0) {
          totalResolved += resolved;
          hasMore = true;
        }
      }

      console.log(
        `[LocationResolver] Background resolution complete. Total resolved: ${totalResolved}`,
      );
    } finally {
      this.backgroundRunning = false;
    }
  }

  /** Fetch and process one batch of unresolved images. Returns count resolved. */
  private async processNextBatch(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('get_unresolved_images', {
      p_limit: BATCH_SIZE,
    });

    if (error) {
      console.error('[LocationResolver] Failed to fetch unresolved images:', error);
      return 0;
    }

    const rows = data as UnresolvedRow[] | null;
    if (!rows || rows.length === 0) return 0;

    let resolved = 0;
    for (const row of rows) {
      if (!this.auth.user() || !this.backgroundRunning) break;
      if (this.pending.has(row.image_id)) continue;

      this.pending.add(row.image_id);
      try {
        if (await this.resolveRow(row)) resolved++;
      } catch {
        // Skip this image, continue with next
      } finally {
        this.pending.delete(row.image_id);
      }
    }
    return resolved;
  }

  /** Stop accepting new work (existing in-flight requests will finish). */
  stopBackground(): void {
    this.backgroundRunning = false;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Check if an image is missing any address field. */
  private isMissingAddress(img: {
    addressLabel: string | null;
    city: string | null;
    district: string | null;
    street: string | null;
    country: string | null;
  }): boolean {
    return (
      img.addressLabel == null ||
      img.city == null ||
      img.district == null ||
      img.street == null ||
      img.country == null
    );
  }

  /** Resolve a single unresolved row — returns true if resolved. */
  private async resolveRow(row: UnresolvedRow): Promise<boolean> {
    const hasGps = row.latitude != null && row.longitude != null;
    const hasAddress = row.address_label != null;

    if (hasGps && this.isRowMissingAddress(row)) {
      // Reverse geocode: GPS → address
      const result = await this.geocoding.reverse(row.latitude!, row.longitude!);
      if (!result) return false;

      await this.persistAddressSingle(row.image_id, result);
      return true;
    }

    if (!hasGps && hasAddress) {
      // Forward geocode: address → GPS
      const result = await this.geocoding.forward(row.address_label!);
      if (!result) return false;

      await this.persistGpsAndAddress(row.image_id, result.lat, result.lng, {
        addressLabel: result.addressLabel,
        city: result.city,
        district: result.district,
        street: result.street,
        country: result.country,
      });
      return true;
    }

    return false;
  }

  private isRowMissingAddress(row: UnresolvedRow): boolean {
    return (
      row.address_label == null ||
      row.city == null ||
      row.district == null ||
      row.street == null ||
      row.country == null
    );
  }

  /** Persist address fields for multiple images sharing the same address. */
  private async persistAddress(imageIds: string[], result: ReverseGeocodeResult): Promise<void> {
    const { error } = await this.supabase.client.rpc('bulk_update_image_addresses', {
      p_image_ids: imageIds,
      p_address_label: result.addressLabel,
      p_city: result.city,
      p_district: result.district,
      p_street: result.street,
      p_country: result.country,
    });
    if (error) {
      console.error('[LocationResolver] Failed to persist address:', error);
    }
  }

  /** Persist address for a single image via the individual RPC. */
  private async persistAddressSingle(imageId: string, result: ReverseGeocodeResult): Promise<void> {
    const { error } = await this.supabase.client.rpc('resolve_image_location', {
      p_image_id: imageId,
      p_address_label: result.addressLabel,
      p_city: result.city,
      p_district: result.district,
      p_street: result.street,
      p_country: result.country,
    });
    if (error) {
      console.error('[LocationResolver] Failed to persist address for', imageId, error);
    }
  }

  /** Persist GPS coordinates and address for a single image. */
  private async persistGpsAndAddress(
    imageId: string,
    lat: number,
    lng: number,
    address: {
      addressLabel: string;
      city: string | null;
      district: string | null;
      street: string | null;
      country: string | null;
    },
  ): Promise<void> {
    const { error } = await this.supabase.client.rpc('resolve_image_location', {
      p_image_id: imageId,
      p_latitude: lat,
      p_longitude: lng,
      p_address_label: address.addressLabel,
      p_city: address.city,
      p_district: address.district,
      p_street: address.street,
      p_country: address.country,
    });
    if (error) {
      console.error('[LocationResolver] Failed to persist GPS + address for', imageId, error);
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface UnresolvedRow {
  image_id: string;
  latitude: number | null;
  longitude: number | null;
  address_label: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  country: string | null;
}
