/**
 * UploadConflictService — detects photoless row conflicts during upload.
 *
 * When a new upload's location matches an existing photoless image row,
 * this service identifies the conflict so the user can decide how to
 * resolve it (attach to existing, or create new).
 */

import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ConflictCandidate } from './upload-manager.types';
import { ExifCoords } from './upload.service';

@Injectable({ providedIn: 'root' })
export class UploadConflictService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  /**
   * Check for existing photoless rows that match the upload's location.
   * Returns the best-matching candidate, or null if no conflict found.
   */
  async findConflict(
    coords: ExifCoords | undefined,
    titleAddress: string | undefined,
  ): Promise<ConflictCandidate | null> {
    const user = this.auth.user();
    if (!user) return null;

    const { data: profile } = await this.supabase.client
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile) return null;

    const lat = coords?.lat ?? null;
    const lng = coords?.lng ?? null;
    const address = titleAddress ?? null;

    const { data: candidates, error } = await this.supabase.client.rpc('find_photoless_conflicts', {
      p_org_id: profile.organization_id,
      p_lat: lat,
      p_lng: lng,
      p_address: address,
    });

    if (error || !candidates || candidates.length === 0) {
      return null;
    }

    return {
      imageId: candidates[0].id,
      addressLabel: candidates[0].address_label ?? undefined,
      latitude: candidates[0].latitude ?? undefined,
      longitude: candidates[0].longitude ?? undefined,
      distanceMeters: candidates[0].distance_m ?? undefined,
    };
  }
}
