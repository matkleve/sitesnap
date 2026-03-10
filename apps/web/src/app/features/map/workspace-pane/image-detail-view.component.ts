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
import { ForwardGeocodeResult, GeocodingService } from '../../../core/geocoding.service';

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
  street: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  direction: number | null;
  location_unresolved: boolean | null;
}

export interface MetadataEntry {
  metadataKeyId: string;
  key: string;
  value: string;
}

interface SelectOption {
  id: string;
  label: string;
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
  private readonly geocodingService = inject(GeocodingService);

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

  /** Whether the thumbnail has finished loading. */
  readonly thumbnailLoaded = signal(false);

  /** Whether image loading errored. */
  readonly imageErrored = signal(false);

  /** Whether data is currently loading from Supabase. */
  readonly loading = signal(false);

  /** Error message if the load failed. */
  readonly error = signal<string | null>(null);

  /** Controls context menu visibility. */
  readonly showContextMenu = signal(false);

  /** Controls delete confirmation dialog visibility. */
  readonly showDeleteConfirm = signal(false);

  /** Whether a save operation is in progress. */
  readonly saving = signal(false);

  /** Available projects for the project dropdown. */
  readonly projectOptions = signal<SelectOption[]>([]);

  /** Whether the add-metadata row is visible. */
  readonly showAddMetadata = signal(false);

  /** Which core field is currently being edited ('address_label', 'captured_at', 'project_id', etc.). */
  readonly editingField = signal<string | null>(null);

  /** Signed URL for the full-resolution image (loaded on demand). */
  readonly fullResUrl = signal<string | null>(null);

  /** Signed URL for the thumbnail (shown until full-res loads). */
  readonly thumbnailUrl = signal<string | null>(null);

  /** Controls lightbox overlay visibility. */
  readonly showLightbox = signal(false);

  /** Address search query string. */
  readonly addressSearchQuery = signal('');

  /** Address search results from geocoder. */
  readonly addressSuggestions = signal<ForwardGeocodeResult[]>([]);

  /** Whether address search is in progress. */
  readonly addressSearchLoading = signal(false);

  /** Metadata key suggestions for autocomplete. */
  readonly metadataKeySuggestions = signal<string[]>([]);

  /** All known metadata key names for the org (loaded once). */
  readonly allMetadataKeyNames = signal<string[]>([]);

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

  /** Formatted upload date (always created_at, read-only). */
  readonly uploadDate = computed(() => {
    const img = this.image();
    if (!img) return null;
    return new Date(img.created_at).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  /** Display name of the currently assigned project. */
  readonly projectName = computed(() => {
    const img = this.image();
    if (!img?.project_id) return '';
    const match = this.projectOptions().find((p) => p.id === img.project_id);
    return match?.label ?? '';
  });

  /** Assembled full address string for the search trigger. */
  readonly fullAddress = computed(() => {
    const img = this.image();
    if (!img) return '';
    return [img.street, img.city, img.district, img.country].filter(Boolean).join(', ');
  });

  /** True when the image is still loading (placeholder should pulse). */
  readonly isImageLoading = computed(() => {
    // Loading if we don't have a URL yet, or have a URL but img hasn't loaded
    const hasThumbUrl = !!this.thumbnailUrl();
    const hasFullUrl = !!this.fullResUrl();
    if (this.imageErrored()) return false;
    if (!hasThumbUrl && !hasFullUrl) return true; // No URLs yet
    if (hasThumbUrl && !this.thumbnailLoaded() && !this.fullResLoaded()) return true;
    return false;
  });

  /** True when the image is ready to display (thumbnail or full-res loaded). */
  readonly imageReady = computed(() => {
    if (this.imageErrored()) return false;
    return this.thumbnailLoaded() || this.fullResLoaded();
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
    this.thumbnailLoaded.set(false);
    this.imageErrored.set(false);
    this.fullResUrl.set(null);
    this.thumbnailUrl.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.saving.set(false);
    this.showContextMenu.set(false);
    this.showDeleteConfirm.set(false);
    this.showAddMetadata.set(false);
    this.editingField.set(null);
    this.showLightbox.set(false);
    this.addressSearchQuery.set('');
    this.addressSuggestions.set([]);
    this.metadataKeySuggestions.set([]);
  }

  private async loadImage(id: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.loading.set(true);
    this.error.set(null);
    this.fullResLoaded.set(false);
    this.thumbnailLoaded.set(false);
    this.imageErrored.set(false);
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

    // Load signed URLs and project list in parallel
    this.loadSignedUrls(imgData, signal);
    if (imgData.organization_id) {
      this.loadProjects(imgData.organization_id);
      this.loadMetadataKeys(imgData.organization_id);
    }
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

  /** Save an image field (address_label, captured_at, project_id, street, city, district, country). */
  async saveImageField(field: string, newValue: string): Promise<void> {
    const img = this.image();
    if (!img) return;

    const oldValue = (img as unknown as Record<string, unknown>)[field] as string | null;
    if (newValue === (oldValue ?? '')) return;

    // Optimistic update
    const updateValue = newValue || null;
    this.image.update((prev) => (prev ? { ...prev, [field]: updateValue } : prev));
    this.editingField.set(null);
    this.saving.set(true);

    const { error } = await this.supabaseService.client
      .from('images')
      .update({ [field]: updateValue })
      .eq('id', img.id);

    if (error) {
      // Roll back
      this.image.update((prev) => (prev ? { ...prev, [field]: oldValue } : prev));
    }
    this.saving.set(false);
  }

  /** Save custom metadata value (Actions #11 / #12). */
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

  /** Action #13/#14 — add a new metadata entry (creates key if needed). */
  async addMetadata(keyName: string, value: string): Promise<void> {
    const img = this.image();
    if (!img || !keyName.trim() || !value.trim()) return;

    this.saving.set(true);

    // Find or create metadata key
    let keyId: string;
    const { data: existing } = await this.supabaseService.client
      .from('metadata_keys')
      .select('id')
      .eq('key_name', keyName.trim())
      .eq('organization_id', img.organization_id!)
      .maybeSingle();

    if (existing) {
      keyId = existing.id;
    } else {
      const { data: created, error: createError } = await this.supabaseService.client
        .from('metadata_keys')
        .insert({ key_name: keyName.trim(), organization_id: img.organization_id! })
        .select('id')
        .single();

      if (createError || !created) {
        this.saving.set(false);
        return;
      }
      keyId = created.id;
    }

    // Upsert the metadata value
    const { error } = await this.supabaseService.client.from('image_metadata').upsert(
      {
        image_id: img.id,
        metadata_key_id: keyId,
        value_text: value.trim(),
      },
      { onConflict: 'image_id,metadata_key_id' },
    );

    if (!error) {
      this.metadata.update((list) => [
        ...list,
        { metadataKeyId: keyId, key: keyName.trim(), value: value.trim() },
      ]);
    }

    this.showAddMetadata.set(false);
    this.saving.set(false);
  }

  /** Action #16 — remove a metadata entry. */
  async removeMetadata(entry: MetadataEntry): Promise<void> {
    const id = this.imageId();
    if (!id) return;

    // Optimistic removal
    const previousList = this.metadata();
    this.metadata.update((list) => list.filter((m) => m.metadataKeyId !== entry.metadataKeyId));

    const { error } = await this.supabaseService.client
      .from('image_metadata')
      .delete()
      .eq('image_id', id)
      .eq('metadata_key_id', entry.metadataKeyId);

    if (error) {
      this.metadata.set(previousList);
    }
  }

  /** Action #18 — opens location correction mode in the parent. */
  requestEditLocation(): void {
    const id = this.imageId();
    if (id) this.editLocationRequested.emit(id);
  }

  /** Action #19 — "Add to project" (placeholder — project picker integration pending). */
  openProjectPicker(): void {
    // Project picker will be integrated when ProjectPickerComponent is implemented.
    // This action slot is wired here per the spec.
  }

  /** Action #20 — triggers delete confirmation dialog. */
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

  /** Called when the thumbnail img element fires (load). */
  onThumbnailLoaded(): void {
    this.thumbnailLoaded.set(true);
  }

  /** Called when any image element fires (error). */
  onImageError(): void {
    this.imageErrored.set(true);
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

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadProjects(organizationId: string): Promise<void> {
    const { data } = await this.supabaseService.client
      .from('projects')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name');

    if (data) {
      this.projectOptions.set(data.map((p: any) => ({ id: p.id, label: p.name })));
    }
  }

  private async loadMetadataKeys(organizationId: string): Promise<void> {
    const { data } = await this.supabaseService.client
      .from('metadata_keys')
      .select('key_name')
      .eq('organization_id', organizationId)
      .order('key_name');

    if (data) {
      this.allMetadataKeyNames.set(data.map((k: any) => k.key_name as string));
    }
  }

  // ── Address search ─────────────────────────────────────────────────────────

  private addressSearchTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Opens address search mode, pre-filling with the current full address. */
  openAddressSearch(): void {
    const currentAddress = this.fullAddress();
    this.addressSearchQuery.set(currentAddress);
    this.editingField.set('address_search');
    // Auto-trigger search if there's existing address text
    if (currentAddress.trim()) {
      this.searchAddress(currentAddress);
    }
  }

  /** Cancels address search and clears state. */
  cancelAddressSearch(): void {
    this.editingField.set(null);
    this.addressSearchQuery.set('');
    this.addressSuggestions.set([]);
  }

  onAddressSearchInput(query: string): void {
    this.addressSearchQuery.set(query);
    if (this.addressSearchTimeout) clearTimeout(this.addressSearchTimeout);

    if (!query.trim()) {
      this.addressSuggestions.set([]);
      return;
    }

    // Debounce 400ms to respect Nominatim rate limits
    this.addressSearchTimeout = setTimeout(() => this.searchAddress(query), 400);
  }

  private async searchAddress(query: string): Promise<void> {
    this.addressSearchLoading.set(true);
    const result = await this.geocodingService.forward(query);
    this.addressSearchLoading.set(false);

    if (result) {
      this.addressSuggestions.set([result]);
    } else {
      this.addressSuggestions.set([]);
    }
  }

  selectFirstAddressResult(): void {
    const results = this.addressSuggestions();
    if (results.length > 0) {
      this.applyAddressSuggestion(results[0]);
    }
  }

  async applyAddressSuggestion(suggestion: ForwardGeocodeResult): Promise<void> {
    const img = this.image();
    if (!img) return;

    // Optimistic update all address fields
    this.image.update((prev) =>
      prev
        ? {
            ...prev,
            street: suggestion.street,
            city: suggestion.city,
            district: suggestion.district,
            country: suggestion.country,
            address_label: suggestion.addressLabel,
          }
        : prev,
    );

    this.editingField.set(null);
    this.addressSearchQuery.set('');
    this.addressSuggestions.set([]);

    // Persist to DB
    const { error } = await this.supabaseService.client
      .from('images')
      .update({
        street: suggestion.street,
        city: suggestion.city,
        district: suggestion.district,
        country: suggestion.country,
        address_label: suggestion.addressLabel,
      })
      .eq('id', img.id);

    if (error) {
      // Roll back on failure
      this.image.update((prev) =>
        prev
          ? {
              ...prev,
              street: img.street,
              city: img.city,
              district: img.district,
              country: img.country,
              address_label: img.address_label,
            }
          : prev,
      );
    }
  }

  // ── Metadata key autocomplete ──────────────────────────────────────────────

  onMetadataKeyInput(query: string): void {
    if (!query.trim()) {
      this.metadataKeySuggestions.set([]);
      return;
    }

    const lower = query.toLowerCase();
    const existing = new Set(this.metadata().map((m) => m.key.toLowerCase()));
    const matches = this.allMetadataKeyNames()
      .filter((k) => k.toLowerCase().includes(lower) && !existing.has(k.toLowerCase()))
      .slice(0, 5);

    this.metadataKeySuggestions.set(matches);
  }
}
