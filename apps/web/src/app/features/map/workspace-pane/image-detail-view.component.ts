/**
 * ImageDetailViewComponent — full detail view for a single photo.
 *
 * Desktop: fills the Workspace Pane content area, replacing the thumbnail grid.
 * Mobile: renders as a full-screen overlay.
 *
 * Ground rules:
 *  - All data is loaded from Supabase when `imageId` input changes.
 *  - Signals for all local state; no RxJS subjects.
 *  - Never calls Supabase client directly — calls go through SupabaseService.
 *  - Full-res image loads on demand (thumbnail shown first).
 *  - Metadata edits patch `image_metadata` via upsert.
 */

import {
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MetadataPropertyRowComponent } from './metadata-property-row.component';
import { SupabaseService } from '../../../core/supabase.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ImageRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  /** Active latitude (may be corrected, or same as exif_latitude). */
  latitude: number | null;
  /** Active longitude (may be corrected, or same as exif_longitude). */
  longitude: number | null;
  /** Original EXIF latitude — never mutated after insert. */
  exif_latitude: number | null;
  /** Original EXIF longitude — never mutated after insert. */
  exif_longitude: number | null;
  captured_at: string | null;
  created_at: string;
  address_label: string | null;
  location_unresolved: boolean | null;
}

export interface MetadataEntry {
  metadataKeyId: string;
  key: string;
  value: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-image-detail-view',
  standalone: true,
  imports: [MetadataPropertyRowComponent],
  templateUrl: './image-detail-view.component.html',
  styleUrl: './image-detail-view.component.scss',
})
export class ImageDetailViewComponent implements OnDestroy {
  private readonly supabaseService = inject(SupabaseService);

  // ── Inputs / outputs ───────────────────────────────────────────────────────

  /** The DB UUID of the image to display. Null hides the component. */
  readonly imageId = input<string | null>(null);

  /** Emitted when the user clicks back/close. Parent sets detailImageId → null. */
  readonly closed = output<void>();

  /** Emitted when "Edit location" is clicked. Payload is the imageId. */
  readonly editLocationRequested = output<string>();

  // ── State signals ──────────────────────────────────────────────────────────

  /** The full image record fetched from `images`. */
  readonly image = signal<ImageRecord | null>(null);

  /** Ordered list of metadata key/value pairs. */
  readonly metadata = signal<MetadataEntry[]>([]);

  /** Whether the full-res image has finished loading. */
  readonly fullResLoaded = signal(false);

  /** Whether data is currently loading from Supabase. */
  readonly loading = signal(false);

  /** Error message if the load failed. */
  readonly error = signal<string | null>(null);

  /** Controls context menu visibility. */
  readonly showContextMenu = signal(false);

  /** Controls delete confirmation dialog visibility. */
  readonly showDeleteConfirm = signal(false);

  /** Signed URL for the full-resolution image (loaded on demand). */
  readonly fullResUrl = signal<string | null>(null);

  /** Signed URL for the thumbnail (shown until full-res loads). */
  readonly thumbnailUrl = signal<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  /** True when the image has been manually corrected. */
  /** True when the image has been manually corrected (active coords differ from EXIF). */
  readonly isCorrected = computed(() => {
    const img = this.image();
    if (!img || img.latitude == null || img.exif_latitude == null) return false;
    return img.latitude !== img.exif_latitude || img.longitude !== img.exif_longitude;
  });

  /** Display title: address label or truncated filename. */
  readonly displayTitle = computed(() => {
    const img = this.image();
    if (!img) return '';
    return img.address_label ?? img.storage_path.split('/').pop() ?? 'Photo';
  });

  /** Formatted capture date. */
  readonly captureDate = computed(() => {
    const img = this.image();
    if (!img) return null;
    const ts = img.captured_at ?? img.created_at;
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private abortController: AbortController | null = null;

  constructor() {
    // Reload whenever imageId changes.
    effect(() => {
      const id = this.imageId();
      if (id) {
        this.loadImage(id);
      } else {
        this.reset();
      }
    });
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  private reset(): void {
    this.image.set(null);
    this.metadata.set([]);
    this.fullResLoaded.set(false);
    this.fullResUrl.set(null);
    this.thumbnailUrl.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.showContextMenu.set(false);
    this.showDeleteConfirm.set(false);
  }

  private async loadImage(id: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.loading.set(true);
    this.error.set(null);
    this.fullResLoaded.set(false);
    this.fullResUrl.set(null);
    this.thumbnailUrl.set(null);

    const [imageResult, metaResult] = await Promise.all([
      this.supabaseService.client.from('images').select('*').eq('id', id).single(),
      this.supabaseService.client
        .from('image_metadata')
        .select('metadata_key_id, value_text, metadata_keys(key_name)')
        .eq('image_id', id),
    ]);

    if (signal.aborted) return;

    if (imageResult.error) {
      this.error.set(imageResult.error.message);
      this.loading.set(false);
      return;
    }

    const imgData = imageResult.data as ImageRecord;
    this.image.set(imgData);
    this.loading.set(false);

    // Map metadata
    const entries: MetadataEntry[] = (metaResult.data ?? []).map((row: any) => ({
      metadataKeyId: row.metadata_key_id as string,
      key: (row.metadata_keys as { key_name: string } | null)?.key_name ?? 'Unknown',
      value: row.value_text as string,
    }));
    this.metadata.set(entries);

    // Load signed URLs in parallel
    this.loadSignedUrls(imgData, signal);
  }

  private async loadSignedUrls(img: ImageRecord, abortSignal: AbortSignal): Promise<void> {
    const thumbPromise = img.thumbnail_path
      ? this.supabaseService.client.storage.from('images').createSignedUrl(img.thumbnail_path, 3600)
      : Promise.resolve(null);

    const fullPromise = this.supabaseService.client.storage
      .from('images')
      .createSignedUrl(img.storage_path, 3600);

    const [thumbResult, fullResult] = await Promise.allSettled([thumbPromise, fullPromise]);

    if (abortSignal.aborted) return;

    this.thumbnailUrl.set(this.extractSignedUrl(thumbResult));
    this.fullResUrl.set(this.extractSignedUrl(fullResult));
  }

  private extractSignedUrl(
    settled: PromiseSettledResult<{ data: { signedUrl: string } | null; error: any } | null>,
  ): string | null {
    if (settled.status !== 'fulfilled') return null;
    const result = settled.value;
    if (!result || result.error) return null;
    return result.data?.signedUrl ?? null;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Action #1 / #2 — back arrow (desktop) or close button (mobile). */
  close(): void {
    this.closed.emit();
  }

  /** Action #3 / #4 — metadata value edited inline; save to Supabase. */
  async saveMetadata(entry: MetadataEntry, newValue: string): Promise<void> {
    if (newValue === entry.value) return;
    const id = this.imageId();
    if (!id) return;

    // Optimistic update
    this.metadata.update((list) =>
      list.map((m) => (m.metadataKeyId === entry.metadataKeyId ? { ...m, value: newValue } : m)),
    );

    const { error } = await this.supabaseService.client.from('image_metadata').upsert(
      {
        image_id: id,
        metadata_key_id: entry.metadataKeyId,
        value_text: newValue,
      },
      { onConflict: 'image_id,metadata_key_id' },
    );

    if (error) {
      // Roll back optimistic update
      this.metadata.update((list) =>
        list.map((m) =>
          m.metadataKeyId === entry.metadataKeyId ? { ...m, value: entry.value } : m,
        ),
      );
    }
  }

  /** Action #5 — opens location correction mode in the parent. */
  requestEditLocation(): void {
    const id = this.imageId();
    if (id) this.editLocationRequested.emit(id);
  }

  /** Action #6 — "Add to project" (placeholder — project picker integration pending). */
  openProjectPicker(): void {
    // Project picker will be integrated when ProjectPickerComponent is implemented.
    // This action slot is wired here per the spec.
  }

  /** Action #7 — triggers delete confirmation dialog. */
  confirmDelete(): void {
    this.showDeleteConfirm.set(true);
    this.showContextMenu.set(false);
  }

  async executeDelete(): Promise<void> {
    const id = this.imageId();
    if (!id) return;

    const { error } = await this.supabaseService.client.from('images').delete().eq('id', id);

    if (!error) {
      this.showDeleteConfirm.set(false);
      this.closed.emit();
    }
  }

  cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  toggleContextMenu(): void {
    this.showContextMenu.update((v) => !v);
  }

  closeContextMenu(): void {
    this.showContextMenu.set(false);
  }

  /** Called when the full-res img element fires (load). */
  onFullResLoaded(): void {
    this.fullResLoaded.set(true);
  }

  /** Coordinate copy helper. */
  copyCoordinates(): void {
    const img = this.image();
    if (!img || img.latitude == null || img.longitude == null) return;
    const text = `${img.latitude.toFixed(6)}, ${img.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text).catch(() => {
      /* silent — clipboard may be unavailable */
    });
    this.showContextMenu.set(false);
  }

  protected formatCoord(value: number | null): string {
    if (value == null) return '—';
    return value.toFixed(6);
  }
}
