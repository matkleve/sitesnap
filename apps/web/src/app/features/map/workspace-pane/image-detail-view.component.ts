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
import { CapturedDateEditorComponent } from './captured-date-editor.component';
import { SupabaseService } from '../../../core/supabase.service';
import { ForwardGeocodeResult, GeocodingService } from '../../../core/geocoding.service';
import { ImageRecord, MetadataEntry, SelectOption } from './image-detail-view.types';
import { AddressSearchHelper } from './address-search.helper';
export type { ImageRecord, MetadataEntry } from './image-detail-view.types';

@Component({
  selector: 'app-image-detail-view',
  standalone: true,
  imports: [MetadataPropertyRowComponent, CapturedDateEditorComponent],
  templateUrl: './image-detail-view.component.html',
  styleUrl: './image-detail-view.component.scss',
})
export class ImageDetailViewComponent implements OnDestroy {
  private readonly supabaseService = inject(SupabaseService);
  private readonly geocodingService = inject(GeocodingService);

  readonly imageId = input<string | null>(null);
  readonly closed = output<void>();
  readonly editLocationRequested = output<string>();

  readonly image = signal<ImageRecord | null>(null);
  readonly metadata = signal<MetadataEntry[]>([]);
  readonly fullResLoaded = signal(false);
  readonly thumbnailLoaded = signal(false);
  readonly imageErrored = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showContextMenu = signal(false);
  readonly showDeleteConfirm = signal(false);
  readonly saving = signal(false);
  readonly projectOptions = signal<SelectOption[]>([]);
  readonly showAddMetadata = signal(false);
  readonly editingField = signal<string | null>(null);
  readonly fullResUrl = signal<string | null>(null);
  readonly thumbnailUrl = signal<string | null>(null);
  readonly showLightbox = signal(false);
  readonly addressSearchQuery = signal('');
  readonly addressSuggestions = signal<ForwardGeocodeResult[]>([]);
  readonly addressSearchLoading = signal(false);
  readonly metadataKeySuggestions = signal<string[]>([]);
  readonly allMetadataKeyNames = signal<string[]>([]);
  readonly editDate = signal('');
  readonly editTime = signal('');

  readonly isCorrected = computed(() => {
    const img = this.image();
    if (!img || img.latitude == null || img.exif_latitude == null) return false;
    return img.latitude !== img.exif_latitude || img.longitude !== img.exif_longitude;
  });

  readonly displayTitle = computed(() => {
    const img = this.image();
    if (!img) return '';
    return img.address_label ?? img.storage_path.split('/').pop() ?? 'Photo';
  });

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
      hour12: false,
    });
  });

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

  readonly projectName = computed(() => {
    const img = this.image();
    if (!img?.project_id) return '';
    const match = this.projectOptions().find((p) => p.id === img.project_id);
    return match?.label ?? '';
  });

  readonly fullAddress = computed(() => {
    const img = this.image();
    if (!img) return '';
    return [img.street, img.city, img.district, img.country].filter(Boolean).join(', ');
  });

  readonly isImageLoading = computed(() => {
    const hasThumbUrl = !!this.thumbnailUrl();
    if (this.imageErrored()) return false;
    if (!hasThumbUrl && !this.fullResUrl()) return true;
    if (hasThumbUrl && !this.thumbnailLoaded() && !this.fullResLoaded()) return true;
    return false;
  });

  readonly imageReady = computed(() => {
    if (this.imageErrored()) return false;
    return this.thumbnailLoaded() || this.fullResLoaded();
  });

  private abortController: AbortController | null = null;

  readonly addressHelper = new AddressSearchHelper(
    this.geocodingService,
    this.supabaseService,
    this.image,
    this.editingField,
    this.addressSearchQuery,
    this.addressSuggestions,
    this.addressSearchLoading,
    () => this.fullAddress(),
  );

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


  close(): void {
    this.closed.emit();
  }

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

  requestEditLocation(): void {
    const id = this.imageId();
    if (id) this.editLocationRequested.emit(id);
  }

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

  onFullResLoaded(): void {
    this.fullResLoaded.set(true);
  }

  onThumbnailLoaded(): void {
    this.thumbnailLoaded.set(true);
  }

  onImageError(): void {
    this.imageErrored.set(true);
  }

  copyCoordinates(): void {
    const img = this.image();
    if (!img || img.latitude == null || img.longitude == null) return;
    const text = `${img.latitude.toFixed(6)}, ${img.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text).catch(() => {
      /* silent — clipboard may be unavailable */
    });
    this.showContextMenu.set(false);
  }

  openCapturedAtEditor(): void {
    const img = this.image();
    if (img?.captured_at) {
      const d = new Date(img.captured_at);
      this.editDate.set(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
      this.editTime.set(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      );
    } else {
      const now = new Date();
      this.editDate.set(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      );
      this.editTime.set('');
    }
    this.editingField.set('captured_at');
  }

  async saveCapturedAt(combined: string): Promise<void> {
    await this.saveImageField('captured_at', combined);
  }

  async clearCapturedAt(): Promise<void> {
    const img = this.image();
    if (!img) return;
    const oldValue = img.captured_at;
    this.image.update((prev) => (prev ? { ...prev, captured_at: null } : prev));
    this.editingField.set(null);
    this.saving.set(true);
    const { error } = await this.supabaseService.client
      .from('images')
      .update({ captured_at: null })
      .eq('id', img.id);
    if (error) {
      this.image.update((prev) => (prev ? { ...prev, captured_at: oldValue } : prev));
    }
    this.saving.set(false);
  }

  protected formatCoord(value: number | null): string {
    if (value == null) return '—';
    return value.toFixed(6);
  }


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


  openAddressSearch(): void {
    this.addressHelper.open();
  }

  cancelAddressSearch(): void {
    this.addressHelper.cancel();
  }

  onAddressSearchInput(query: string): void {
    this.addressHelper.onInput(query);
  }

  selectFirstAddressResult(): void {
    this.addressHelper.selectFirst();
  }

  async applyAddressSuggestion(suggestion: ForwardGeocodeResult): Promise<void> {
    await this.addressHelper.apply(suggestion);
  }

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
