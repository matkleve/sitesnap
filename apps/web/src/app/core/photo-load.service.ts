import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import type {
  PhotoLoadState,
  PhotoSize,
  CacheEntry,
  SignedUrlResult,
  UrlChangedEvent,
  StateChangedEvent,
  BatchCompleteEvent,
} from './photo-load.model';

/** Camera icon SVG data-URI — used in loading/idle placeholders */
export const PHOTO_PLACEHOLDER_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 15.2l3.4-2.8L18 15V6H6v7.6L9 11l3 4.2zM20 4v16H4V4h16zm-8.5 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'/%3E%3C/svg%3E";

/** Crossed-out image SVG data-URI — used in error/no-photo placeholders */
export const PHOTO_NO_PHOTO_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21 5c0-.55-.45-1-1-1H5.83L21 19.17V5zM2.81 2.81L1.39 4.22 3 5.83V19c0 .55.45 1 1 1h13.17l2.61 2.61 1.41-1.41L2.81 2.81zM6 17l3-4 2.25 3 .82-1.1 2.1 2.1H6z'/%3E%3C/svg%3E";

const TRANSFORMS: Record<PhotoSize, { width: number; height: number; resize: 'cover' } | null> = {
  marker: { width: 80, height: 80, resize: 'cover' },
  thumb: { width: 256, height: 256, resize: 'cover' },
  full: null,
};

const STALE_THRESHOLD_MS = 3_000_000; // 50 minutes
const SIGN_EXPIRY_SECONDS = 3600;

@Injectable({ providedIn: 'root' })
export class PhotoLoadService {
  private readonly supabase = inject(SupabaseService);

  private readonly cache = new Map<string, CacheEntry>();
  private readonly loadStates = new Map<string, WritableSignal<PhotoLoadState>>();

  // ── Event streams ──────────────────────────────────────────────────────

  readonly urlChanged$ = new Subject<UrlChangedEvent>();
  readonly stateChanged$ = new Subject<StateChangedEvent>();
  readonly batchComplete$ = new Subject<BatchCompleteEvent>();

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Returns a readonly signal tracking the current PhotoLoadState for an image+size pair.
   * Creates the signal on first access (default: 'idle').
   */
  getLoadState(imageId: string, size: PhotoSize): WritableSignal<PhotoLoadState> {
    const key = this.cacheKey(imageId, size);
    let state = this.loadStates.get(key);
    if (!state) {
      state = signal<PhotoLoadState>('idle');
      this.loadStates.set(key, state);
    }
    return state;
  }

  /**
   * Get a signed URL for a single image at a given size.
   * Uses cache when valid, otherwise signs via Supabase Storage.
   */
  async getSignedUrl(
    storagePath: string,
    size: PhotoSize,
    imageId?: string,
  ): Promise<SignedUrlResult> {
    const id = imageId ?? storagePath;
    const key = this.cacheKey(id, size);

    // Check cache
    const cached = this.cache.get(key);
    if (cached && !this.isStale(cached)) {
      return { url: cached.url, error: null };
    }

    // Transition to loading
    this.setLoadState(id, size, 'loading');

    const transform = TRANSFORMS[size];
    const { data, error } = await this.supabase.client.storage
      .from('images')
      .createSignedUrl(storagePath, SIGN_EXPIRY_SECONDS, transform ? { transform } : undefined);

    if (error || !data?.signedUrl) {
      this.setLoadState(id, size, 'error');
      return { url: null, error: error?.message ?? 'Failed to sign URL' };
    }

    this.setCacheEntry(id, size, { url: data.signedUrl, signedAt: Date.now(), isLocal: false });
    this.setLoadState(id, size, 'loaded');
    return { url: data.signedUrl, error: null };
  }

  /**
   * Batch-sign URLs for multiple images at a given size.
   * Uses createSignedUrls for items with thumbnailPath, individual signing with transform for others.
   */
  async batchSign(
    items: Array<{ id: string; storagePath: string | null; thumbnailPath?: string | null }>,
    size: PhotoSize,
  ): Promise<Map<string, SignedUrlResult>> {
    const results = new Map<string, SignedUrlResult>();
    const toSign: typeof items = [];

    // Check cache first
    for (const item of items) {
      const key = this.cacheKey(item.id, size);
      const cached = this.cache.get(key);
      if (cached && !this.isStale(cached)) {
        results.set(item.id, { url: cached.url, error: null });
      } else {
        toSign.push(item);
        this.setLoadState(item.id, size, 'loading');
      }
    }

    if (toSign.length === 0) {
      this.batchComplete$.next({ imageIds: items.map((i) => i.id), size });
      return results;
    }

    // Split: items with pre-generated thumbnail vs those needing a transform
    const withThumb = toSign.filter((i) => i.thumbnailPath);
    const withoutThumb = toSign.filter((i) => !i.thumbnailPath && i.storagePath);

    // 1) Batch-sign pre-generated thumbnails
    if (withThumb.length > 0) {
      const paths = withThumb.map((i) => i.thumbnailPath!);
      const { data } = await this.supabase.client.storage
        .from('images')
        .createSignedUrls(paths, SIGN_EXPIRY_SECONDS);

      if (data) {
        const pathToId = new Map(withThumb.map((i) => [i.thumbnailPath!, i.id]));
        for (const item of data) {
          if (item.signedUrl && item.path) {
            const imageId = pathToId.get(item.path);
            if (imageId) {
              this.setCacheEntry(imageId, size, {
                url: item.signedUrl,
                signedAt: Date.now(),
                isLocal: false,
              });
              this.setLoadState(imageId, size, 'loaded');
              results.set(imageId, { url: item.signedUrl, error: null });
            }
          }
        }
      }
    }

    // 2) Individual-sign originals with transform
    if (withoutThumb.length > 0) {
      const transform = TRANSFORMS[size];
      const individualResults = await Promise.all(
        withoutThumb.map(async (item) => {
          const { data, error } = await this.supabase.client.storage
            .from('images')
            .createSignedUrl(
              item.storagePath!,
              SIGN_EXPIRY_SECONDS,
              transform ? { transform } : undefined,
            );
          return { id: item.id, url: data?.signedUrl ?? null, error: error?.message ?? null };
        }),
      );

      for (const r of individualResults) {
        if (r.url) {
          this.setCacheEntry(r.id, size, { url: r.url, signedAt: Date.now(), isLocal: false });
          this.setLoadState(r.id, size, 'loaded');
          results.set(r.id, { url: r.url, error: null });
        } else {
          this.setLoadState(r.id, size, 'error');
          results.set(r.id, { url: null, error: r.error ?? 'Failed to sign URL' });
        }
      }
    }

    // Mark items that weren't successfully signed with error
    for (const item of toSign) {
      if (!results.has(item.id)) {
        this.setLoadState(item.id, size, 'error');
        results.set(item.id, { url: null, error: 'Not signed' });
      }
    }

    this.batchComplete$.next({ imageIds: items.map((i) => i.id), size });
    return results;
  }

  /**
   * Preload an image URL by forcing the browser to download it.
   * Resolves true if the image loads, false on error.
   */
  preload(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /** Clear all cached URLs for an image (all sizes); next getSignedUrl will re-sign. */
  invalidate(imageId: string): void {
    for (const size of ['marker', 'thumb', 'full'] as PhotoSize[]) {
      const key = this.cacheKey(imageId, size);
      this.cache.delete(key);
    }
  }

  /**
   * Clear entries older than maxAgeMs.
   * Local blob URLs (isLocal: true) are never cleared by staleness.
   */
  invalidateStale(maxAgeMs: number = STALE_THRESHOLD_MS): number {
    const now = Date.now();
    let cleared = 0;
    for (const [key, entry] of this.cache) {
      if (!entry.isLocal && now - entry.signedAt > maxAgeMs) {
        this.cache.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Inject a local ObjectURL (from upload) into the cache at all sizes.
   * Loads in ~0ms, no network request.
   */
  setLocalUrl(imageId: string, blobUrl: string): void {
    for (const size of ['marker', 'thumb', 'full'] as PhotoSize[]) {
      this.setCacheEntry(imageId, size, { url: blobUrl, signedAt: Date.now(), isLocal: true });
      this.setLoadState(imageId, size, 'loaded');
    }
  }

  /** Mark an image as having no photo (storage_path is null). Sets all sizes to 'no-photo'. */
  markNoPhoto(imageId: string): void {
    for (const size of ['marker', 'thumb', 'full'] as PhotoSize[]) {
      this.setLoadState(imageId, size, 'no-photo');
    }
  }

  /**
   * Revoke the cached blob URL and clear the cache entry.
   * Next access will re-sign from storage.
   */
  revokeLocalUrl(imageId: string): void {
    for (const size of ['marker', 'thumb', 'full'] as PhotoSize[]) {
      const key = this.cacheKey(imageId, size);
      const entry = this.cache.get(key);
      if (entry?.isLocal) {
        URL.revokeObjectURL(entry.url);
      }
      this.cache.delete(key);

      const state = this.loadStates.get(key);
      if (state) {
        state.set('idle');
        this.stateChanged$.next({ imageId, size, state: 'idle' });
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private cacheKey(imageId: string, size: PhotoSize): string {
    return `${imageId}:${size}`;
  }

  private isStale(entry: CacheEntry): boolean {
    if (entry.isLocal) return false;
    return Date.now() - entry.signedAt > STALE_THRESHOLD_MS;
  }

  private setCacheEntry(imageId: string, size: PhotoSize, entry: CacheEntry): void {
    const key = this.cacheKey(imageId, size);
    this.cache.set(key, entry);
    this.urlChanged$.next({ imageId, size, url: entry.url });
  }

  private setLoadState(imageId: string, size: PhotoSize, newState: PhotoLoadState): void {
    const state = this.getLoadState(imageId, size);
    state.set(newState);
    this.stateChanged$.next({ imageId, size, state: newState });
  }
}
