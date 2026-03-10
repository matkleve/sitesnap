/**
 * UploadService — handles the full photo ingestion pipeline.
 *
 * Ground rules:
 *  - Validates file before any network call (25 MB max, allowed MIME types).
 *  - Parses EXIF GPS with exifr; coordinates are read-only after insert.
 *  - Uploads the original file to Supabase Storage at {org_id}/{user_id}/{uuid}.{ext}.
 *  - Inserts an `images` row; the DB trigger populates the `geog` PostGIS column.
 *  - Storage URLs are always signed (TTL 3600 s) — no public paths returned to callers.
 *  - EXIF lat/lng are stored in exif_latitude / exif_longitude (immutable).
 *    latitude / longitude start identical to EXIF; corrections go in coordinate_corrections.
 *  - Errors are returned as { error }; this service never throws.
 *  - No real Supabase calls in unit tests — SupabaseService is faked in specs.
 */

import { Injectable, inject } from '@angular/core';
import * as exifr from 'exifr';
import { AuthService } from './auth.service';
import { GeocodingService } from './geocoding.service';
import { SupabaseService } from './supabase.service';

// ── Constants ──────────────────────────────────────────────────────────────────

/** 25 MiB — matches architecture.md §5 and the storage bucket file_size_limit. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** MIME types accepted for upload (see security-boundaries.md §4.4). */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

// ── Types ──────────────────────────────────────────────────────────────────────

/** Validated GPS coordinates from EXIF parsing. */
export interface ExifCoords {
  lat: number;
  lng: number;
}

/** EXIF fields extracted from an image file. */
export interface ParsedExif {
  /** GPS coordinates, present only when the image carries GPS tags. */
  coords?: ExifCoords;
  /** Original capture timestamp from EXIF DateTimeOriginal. */
  capturedAt?: Date;
  /** Camera compass direction in degrees (0–360), from GPSImgDirection. */
  direction?: number;
}

/** A successfully completed upload. */
export interface UploadSuccess {
  /** UUID primary key of the newly inserted `images` row. */
  id: string;
  /** Supabase Storage path for the original file. */
  storagePath: string;
  /** Persisted coordinates (EXIF or manually supplied). */
  coords?: ExifCoords;
  /** Camera compass direction in degrees (0–360), if available from EXIF. */
  direction?: number;
  error: null;
}

/** A failed upload carrying the reason. */
export interface UploadFailure {
  error: Error | string;
}

/** Return type of uploadFile(). */
export type UploadResult = UploadSuccess | UploadFailure;

/** Result of client-side file validation. */
export interface FileValidation {
  valid: boolean;
  /** Human-readable reason when valid === false. */
  error?: string;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly geocoding = inject(GeocodingService);

  // ── File validation ────────────────────────────────────────────────────────

  /**
   * Validates a file against size and MIME-type rules.
   * This is a synchronous, client-side check — the storage bucket enforces the
   * same limits server-side, but we surface the error early for better UX.
   */
  validateFile(file: File): FileValidation {
    if (file.size > MAX_FILE_SIZE) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: `"${file.name}" is ${mb} MB — maximum allowed is 25 MB.`,
      };
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        valid: false,
        error: `"${file.name}" has unsupported type "${file.type}". Use JPEG, PNG, HEIC, HEIF, or WebP.`,
      };
    }
    return { valid: true };
  }

  // ── EXIF parsing ───────────────────────────────────────────────────────────

  /**
   * Extracts GPS coordinates and capture timestamp from the file's EXIF data.
   * Returns an empty object when no GPS tags are present or parsing fails.
   * Never throws — a failed parse is treated as "no EXIF data".
   */
  async parseExif(file: File): Promise<ParsedExif> {
    try {
      const [gps, meta] = await Promise.all([
        exifr.gps(file),
        exifr.parse(file, ['DateTimeOriginal', 'GPSImgDirection']),
      ]);

      const coords: ExifCoords | undefined =
        gps?.latitude != null && gps?.longitude != null
          ? { lat: gps.latitude, lng: gps.longitude }
          : undefined;

      const rawDir = meta?.GPSImgDirection;
      const direction: number | undefined =
        typeof rawDir === 'number' && rawDir >= 0 && rawDir <= 360 ? rawDir : undefined;

      return {
        coords,
        capturedAt: meta?.DateTimeOriginal ?? undefined,
        direction,
      };
    } catch {
      // Silently treat parse failures as "no EXIF" — the caller will
      // prompt the user for manual placement.
      return {};
    }
  }

  // ── Storage signed URL ─────────────────────────────────────────────────────

  /**
   * Returns a 1-hour signed URL for the given storage path.
   * Used by callers that need to display or share the image without making
   * the bucket public.
   */
  async getSignedUrl(
    storagePath: string,
  ): Promise<{ url: string; error: null } | { error: Error | string }> {
    const { data, error } = await this.supabase.client.storage
      .from('images')
      .createSignedUrl(storagePath, 3600);

    if (error) return { error: this.mapStorageError(error) };
    return { url: data.signedUrl, error: null };
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  /**
   * Full ingestion pipeline for a single file:
   *   1. Validate (must pass before this method is called — callers should
   *      call validateFile() first, but a guard check runs here too).
   *   2. Resolve the authenticated user's profile to get organization_id.
   *   3. Upload the file to Storage at `{org_id}/{user_id}/{uuid}.{ext}`.
   *   4. Insert an `images` row; EXIF coords go in exif_latitude / exif_longitude
   *      AND in latitude / longitude (corrections go in coordinate_corrections).
   *   5. Return the new row's ID + resolved coordinates.
   *
   * @param file       The browser File object to upload.
   * @param manualCoords  Manually placed coordinates — used when EXIF is absent.
   *                      If provided AND EXIF GPS is also present, EXIF wins for
   *                      exif_latitude/exif_longitude; manualCoords wins for
   *                      latitude/longitude.
   */
  async uploadFile(
    file: File,
    manualCoords?: ExifCoords,
    parsedExif?: ParsedExif,
  ): Promise<UploadResult> {
    // ── 0. Auth guard ──────────────────────────────────────────────────────
    const user = this.auth.user();
    if (!user) {
      return { error: 'Not authenticated.' };
    }

    // ── 1. Inline validation ───────────────────────────────────────────────
    const validation = this.validateFile(file);
    if (!validation.valid) {
      return { error: validation.error! };
    }

    // ── 2. Fetch org ID from profiles ─────────────────────────────────────
    const { data: profile, error: profileError } = await this.supabase.client
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return { error: profileError ?? new Error('Profile not found.') };
    }

    const orgId: string = profile.organization_id;

    // ── 3. Build storage path ──────────────────────────────────────────────
    const uuid = crypto.randomUUID();
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${orgId}/${user.id}/${uuid}.${ext}`;

    // ── 4. Upload to Supabase Storage ──────────────────────────────────────
    const { error: storageError } = await this.supabase.client.storage
      .from('images')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (storageError) {
      return { error: this.mapStorageError(storageError) };
    }

    // ── 5. Parse EXIF ──────────────────────────────────────────────────────
    // Re-use caller-supplied result when available to avoid parsing the file twice.
    const {
      coords: exifCoords,
      capturedAt,
      direction,
    } = parsedExif ?? (await this.parseExif(file));

    // Determine the persisted lat/lng:
    //  - EXIF GPS takes precedence over manual placement for the EXIF columns.
    //  - Manual coords are used for the mutable latitude/longitude columns
    //    when EXIF is absent.
    const finalCoords: ExifCoords | undefined = exifCoords ?? manualCoords;

    // ── 6. Insert images row ───────────────────────────────────────────────
    const { data: imageRow, error: dbError } = await this.supabase.client
      .from('images')
      .insert({
        user_id: user.id,
        organization_id: orgId,
        storage_path: storagePath,
        exif_latitude: exifCoords?.lat ?? null,
        exif_longitude: exifCoords?.lng ?? null,
        latitude: finalCoords?.lat ?? null,
        longitude: finalCoords?.lng ?? null,
        captured_at: capturedAt ?? null,
        direction: direction ?? null,
        location_unresolved: finalCoords != null,
      })
      .select('id')
      .single();

    if (dbError) {
      return { error: dbError };
    }

    // Fire-and-forget: reverse-geocode coordinates to populate address fields.
    if (finalCoords) {
      this.resolveAddress(imageRow.id as string, finalCoords.lat, finalCoords.lng);
    }

    return {
      id: imageRow.id as string,
      storagePath,
      coords: finalCoords,
      direction,
      error: null,
    };
  }

  /**
   * Reverse-geocode coordinates and update the image row with structured address fields.
   * Runs asynchronously after upload — failures are logged but do not block the upload result.
   */
  private async resolveAddress(imageId: string, lat: number, lng: number): Promise<void> {
    try {
      const result = await this.geocoding.reverse(lat, lng);
      if (!result) return;

      const { error } = await this.supabase.client.rpc(
        'bulk_update_image_addresses',
        {
          p_image_ids: [imageId],
          p_address_label: result.addressLabel,
          p_city: result.city,
          p_district: result.district,
          p_street: result.street,
          p_country: result.country,
        },
      );

      if (error) {
        console.error('Failed to persist address for image', imageId, error);
      }
    } catch {
      // Non-critical — address will show as "Unknown district" until resolved.
    }
  }

  private mapStorageError(error: unknown): Error | string {
    const message =
      typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';

    if (/bucket\s+not\s+found/i.test(message)) {
      return 'Storage bucket "images" is missing in this Supabase project. Create it (or run the storage migration) and retry.';
    }

    return (error as Error | string) ?? 'Storage error.';
  }
}
