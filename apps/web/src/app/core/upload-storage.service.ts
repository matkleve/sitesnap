/**
 * UploadStorageService — Supabase Storage upload helper.
 *
 * Used by replace/attach pipelines that handle DB insert separately
 * from the storage upload step.
 */

import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class UploadStorageService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  /**
   * Upload a file to Supabase Storage and return the storage path.
   * Returns null on failure.
   */
  async upload(file: File): Promise<string | null> {
    const user = this.auth.user();
    if (!user) return null;

    const { data: profile } = await this.supabase.client
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile) return null;

    const uuid = crypto.randomUUID();
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${profile.organization_id}/${user.id}/${uuid}.${ext}`;

    const { error } = await this.supabase.client.storage
      .from('images')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (error) return null;
    return storagePath;
  }
}
