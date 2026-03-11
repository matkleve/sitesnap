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
    console.log('[upload-storage] upload called:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    const user = this.auth.user();
    if (!user) {
      console.error('[upload-storage] ✗ no authenticated user');
      return null;
    }
    console.log('[upload-storage] user:', user.id);

    const { data: profile, error: profileError } = await this.supabase.client
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      console.error('[upload-storage] ✗ profile fetch failed:', profileError);
      return null;
    }
    console.log('[upload-storage] org:', profile.organization_id);

    const uuid = crypto.randomUUID();
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${profile.organization_id}/${user.id}/${uuid}.${ext}`;
    console.log('[upload-storage] uploading to path:', storagePath);

    const { error } = await this.supabase.client.storage
      .from('images')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (error) {
      console.error('[upload-storage] ✗ Supabase storage.upload error:', error);
      return null;
    }
    console.log('[upload-storage] ✓ upload succeeded:', storagePath);
    return storagePath;
  }
}
