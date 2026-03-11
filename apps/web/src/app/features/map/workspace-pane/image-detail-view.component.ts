import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CapturedDateEditorComponent, DateSaveEvent } from './captured-date-editor.component';
import { SupabaseService } from '../../../core/supabase.service';
import { UploadService, ALLOWED_MIME_TYPES } from '../../../core/upload.service';
import {
  UploadManagerService,
  ImageReplacedEvent,
  ImageAttachedEvent,
  UploadFailedEvent,
} from '../../../core/upload-manager.service';
import { WorkspaceViewService } from '../../../core/workspace-view.service';
import { ToastService } from '../../../core/toast.service';
import {
  PhotoLoadService,
  PHOTO_PLACEHOLDER_ICON,
  PHOTO_NO_PHOTO_ICON,
} from '../../../core/photo-load.service';
import type { PhotoLoadState } from '../../../core/photo-load.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ForwardGeocodeResult } from '../../../core/geocoding.service';
import { ImageRecord, MetadataEntry, SelectOption } from './image-detail-view.types';
import { PhotoLightboxComponent } from '../../../shared/photo-lightbox/photo-lightbox.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  QuickInfoChipsComponent,
  ChipDef,
} from '../../../shared/quick-info-chips/quick-info-chips.component';
import { AddressSearchComponent } from './address-search/address-search.component';
import { MetadataSectionComponent } from './metadata-section/metadata-section.component';
import { DetailActionsComponent } from './detail-actions/detail-actions.component';
export type { ImageRecord, MetadataEntry } from './image-detail-view.types';

@Component({
  selector: 'app-image-detail-view',
  standalone: true,
  imports: [
    CapturedDateEditorComponent,
    PhotoLightboxComponent,
    ConfirmDialogComponent,
    QuickInfoChipsComponent,
    AddressSearchComponent,
    MetadataSectionComponent,
    DetailActionsComponent,
  ],
  templateUrl: './image-detail-view.component.html',
  styleUrl: './image-detail-view.component.scss',
  host: {
    '[style.--placeholder-icon]': 'placeholderIconUrl',
    '[style.--no-photo-icon]': 'noPhotoIconUrl',
  },
})
export class ImageDetailViewComponent implements OnDestroy {
  readonly placeholderIconUrl = `url("${PHOTO_PLACEHOLDER_ICON}")`;
  readonly noPhotoIconUrl = `url("${PHOTO_NO_PHOTO_ICON}")`;
  private readonly supabaseService = inject(SupabaseService);
  private readonly uploadService = inject(UploadService);
  private readonly uploadManager = inject(UploadManagerService);
  private readonly workspaceView = inject(WorkspaceViewService);
  private readonly photoLoad = inject(PhotoLoadService);
  private readonly toastService = inject(ToastService);

  readonly imageId = input<string | null>(null);
  readonly closed = output<void>();
  readonly zoomToLocationRequested = output<{ imageId: string; lat: number; lng: number }>();

  readonly image = signal<ImageRecord | null>(null);
  readonly metadata = signal<MetadataEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showContextMenu = signal(false);
  readonly showDeleteConfirm = signal(false);
  readonly saving = signal(false);
  readonly projectOptions = signal<SelectOption[]>([]);
  readonly editingField = signal<string | null>(null);
  readonly fullResUrl = signal<string | null>(null);
  readonly thumbnailUrl = signal<string | null>(null);
  readonly showLightbox = signal(false);
  readonly allMetadataKeyNames = signal<string[]>([]);
  private readonly activeJobId = signal<string | null>(null);

  /** Tracks whether full-res image has been preloaded via PhotoLoadService.preload() */
  readonly fullResPreloaded = signal(false);

  /** PhotoLoadService load state for thumbnail tier */
  readonly thumbState = computed<PhotoLoadState>(() => {
    const id = this.imageId();
    if (!id) return 'idle';
    return this.photoLoad.getLoadState(id, 'thumb')();
  });

  /** PhotoLoadService load state for full-res tier */
  readonly fullState = computed<PhotoLoadState>(() => {
    const id = this.imageId();
    if (!id) return 'idle';
    return this.photoLoad.getLoadState(id, 'full')();
  });

  readonly hasPhoto = computed(() => !!this.image()?.storage_path);
  readonly replacing = computed(() => {
    const jobId = this.activeJobId();
    if (!jobId) return false;
    const jobs = this.uploadManager.jobs();
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;
    return job.phase !== 'complete' && job.phase !== 'error' && job.phase !== 'skipped';
  });
  readonly replaceError = signal<string | null>(null);
  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  readonly editDate = signal('');
  readonly editTime = signal('');

  readonly isCorrected = computed(() => {
    const img = this.image();
    if (!img || img.latitude == null || img.exif_latitude == null) return false;
    return img.latitude !== img.exif_latitude || img.longitude !== img.exif_longitude;
  });

  readonly hasCoordinates = computed(() => {
    const img = this.image();
    return img?.latitude != null && img?.longitude != null;
  });

  readonly displayTitle = computed(() => {
    const img = this.image();
    if (!img) return '';
    return img.address_label ?? img.storage_path?.split('/').pop() ?? 'Photo';
  });

  readonly captureDate = computed(() => {
    const img = this.image();
    if (!img) return null;
    if (!img.captured_at) return null;
    const ts = img.captured_at;
    if (img.has_time) {
      return new Date(ts).toLocaleString('de-AT', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } else {
      return new Date(ts).toLocaleDateString('de-AT', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  });

  readonly uploadDate = computed(() => {
    const img = this.image();
    if (!img) return null;
    return new Date(img.created_at).toLocaleString('de-AT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
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
    const thumb = this.thumbState();
    const full = this.fullState();
    if (thumb === 'no-photo') return false;
    if (thumb === 'error' && full === 'error') return false;
    if (thumb === 'loaded' || this.fullResPreloaded()) return false;
    return true;
  });

  readonly imageReady = computed(() => {
    if (this.fullResPreloaded()) return true;
    if (this.thumbState() === 'loaded' && this.thumbnailUrl()) return true;
    return false;
  });

  private abortController: AbortController | null = null;

  readonly infoChips = computed<ChipDef[]>(() => {
    const img = this.image();
    if (!img) return [];
    const hasGps = img.latitude != null;
    return [
      {
        icon: 'folder',
        text: this.projectName() || 'No project',
        variant: img.project_id ? ('filled' as const) : ('default' as const),
        title: 'Project',
      },
      {
        icon: 'schedule',
        text: this.captureDate() ?? 'No date',
        title: 'Capture date',
      },
      {
        icon: 'my_location',
        text: hasGps ? (this.isCorrected() ? 'Corrected' : 'GPS') : 'No GPS',
        variant: hasGps ? ('success' as const) : ('warning' as const),
        title: hasGps ? 'Copy coordinates' : 'No GPS data',
      },
    ];
  });

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

    // React to imageReplaced$ — instant blob preview + re-sign URLs
    this.uploadManager.imageReplaced$
      .pipe(
        takeUntilDestroyed(),
        filter((e) => e.imageId === this.imageId()),
      )
      .subscribe((event) => this.handleImageReplaced(event));

    // React to imageAttached$ — switch from upload prompt to photo display
    this.uploadManager.imageAttached$
      .pipe(
        takeUntilDestroyed(),
        filter((e) => e.imageId === this.imageId()),
      )
      .subscribe((event) => this.handleImageAttached(event));

    // React to uploadFailed$ — surface pipeline errors for replace/attach jobs
    this.uploadManager.uploadFailed$
      .pipe(
        takeUntilDestroyed(),
        filter((e: UploadFailedEvent) => {
          const jobs = this.uploadManager.jobs();
          const job = jobs.find((j) => j.id === e.jobId);
          return job?.targetImageId === this.imageId();
        }),
      )
      .subscribe((event: UploadFailedEvent) => {
        this.replaceError.set(event.error);
        this.activeJobId.set(null);
        this.toastService.show({ message: event.error, type: 'error' });
      });
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  private reset(): void {
    this.image.set(null);
    this.metadata.set([]);
    this.fullResPreloaded.set(false);
    this.fullResUrl.set(null);
    this.thumbnailUrl.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.saving.set(false);
    this.showContextMenu.set(false);
    this.showDeleteConfirm.set(false);
    this.editingField.set(null);
    this.showLightbox.set(false);
    this.activeJobId.set(null);
    this.replaceError.set(null);
  }

  private async loadImage(id: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.loading.set(true);
    this.error.set(null);
    this.fullResPreloaded.set(false);
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
    if (imgData.storage_path) {
      this.loadSignedUrls(imgData, signal);
    } else {
      this.photoLoad.markNoPhoto(imgData.id);
    }
    if (imgData.organization_id) {
      this.loadProjects(imgData.organization_id);
      this.loadMetadataKeys(imgData.organization_id);
    }
  }

  private async loadSignedUrls(img: ImageRecord, abortSignal: AbortSignal): Promise<void> {
    if (!img.storage_path) return;

    const thumbPath = img.thumbnail_path ?? img.storage_path;
    const [thumbResult, fullResult] = await Promise.all([
      this.photoLoad.getSignedUrl(thumbPath, 'thumb', img.id),
      this.photoLoad.getSignedUrl(img.storage_path, 'full', img.id),
    ]);

    if (abortSignal.aborted) return;

    this.thumbnailUrl.set(thumbResult.url);
    this.fullResUrl.set(fullResult.url);

    // Preload full-res for crossfade (spec: photoLoad.preload before showing)
    if (fullResult.url) {
      const preloaded = await this.photoLoad.preload(fullResult.url);
      if (!abortSignal.aborted) {
        this.fullResPreloaded.set(preloaded);
      }
    }
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

  zoomToLocation(): void {
    const img = this.image();
    if (!img || img.latitude == null || img.longitude == null) return;
    this.zoomToLocationRequested.emit({ imageId: img.id, lat: img.latitude, lng: img.longitude });
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

  copyCoordinates(): void {
    const img = this.image();
    if (!img || img.latitude == null || img.longitude == null) return;
    const text = `${img.latitude.toFixed(6)}, ${img.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text).catch(() => {
      /* silent — clipboard may be unavailable */
    });
    this.toastService.show({ message: 'Coordinates copied', type: 'info', duration: 2000 });
    this.showContextMenu.set(false);
  }

  openCapturedAtEditor(): void {
    const img = this.image();
    if (img?.captured_at) {
      const d = new Date(img.captured_at);
      this.editDate.set(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
      if (img.has_time) {
        this.editTime.set(
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        );
      } else {
        this.editTime.set('');
      }
    } else {
      this.editDate.set('');
      this.editTime.set('');
    }
    this.editingField.set('captured_at');
  }

  async saveCapturedAt(event: DateSaveEvent): Promise<void> {
    this.editingField.set(null);
    const img = this.image();
    if (!img) return;

    if (!event.date) {
      // Cleared — set captured_at to null
      const oldCapturedAt = img.captured_at;
      const oldHasTime = img.has_time;
      this.image.update((prev) => (prev ? { ...prev, captured_at: null, has_time: false } : prev));
      this.saving.set(true);
      const { error } = await this.supabaseService.client
        .from('images')
        .update({ captured_at: null, has_time: false })
        .eq('id', img.id);
      if (error) {
        this.image.update((prev) =>
          prev ? { ...prev, captured_at: oldCapturedAt, has_time: oldHasTime } : prev,
        );
      }
      this.saving.set(false);
      return;
    }

    const hasTime = !!event.time;
    const localStr = hasTime ? `${event.date}T${event.time}:00` : `${event.date}T00:00:00`;
    const combined = new Date(localStr).toISOString();
    const oldCapturedAt = img.captured_at;
    const oldHasTime = img.has_time;
    this.image.update((prev) =>
      prev ? { ...prev, captured_at: combined, has_time: hasTime } : prev,
    );
    this.saving.set(true);
    const { error } = await this.supabaseService.client
      .from('images')
      .update({ captured_at: combined, has_time: hasTime })
      .eq('id', img.id);
    if (error) {
      this.image.update((prev) =>
        prev ? { ...prev, captured_at: oldCapturedAt, has_time: oldHasTime } : prev,
      );
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
    this.editingField.set('address_search');
  }

  async applyAddressSuggestion(suggestion: ForwardGeocodeResult): Promise<void> {
    const img = this.image();
    if (!img) return;

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

  onChipClicked(index: number): void {
    switch (index) {
      case 0:
        this.editingField.set('project_id');
        break;
      case 1:
        this.openCapturedAtEditor();
        break;
      case 2:
        this.copyCoordinates();
        break;
    }
  }

  openProjectPicker(): void {
    this.editingField.set('project_id');
  }

  /** Accepted MIME types for the file input */
  readonly acceptTypes = Array.from(ALLOWED_MIME_TYPES).join(',');

  triggerFileInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const img = this.image();
    if (!img) return;

    // Validate locally for instant feedback
    const validation = this.uploadService.validateFile(file);
    if (!validation.valid) {
      this.replaceError.set(validation.error!);
      return;
    }

    this.replaceError.set(null);

    // Delegate to UploadManagerService — survives component destruction
    const jobId = img.storage_path
      ? this.uploadManager.replaceFile(img.id, file)
      : this.uploadManager.attachFile(img.id, file);

    this.activeJobId.set(jobId);
  }

  // ── Upload event handlers ──────────────────────────────────────────────────

  private async handleImageReplaced(event: ImageReplacedEvent): Promise<void> {
    // UploadManagerService already called photoLoad.setLocalUrl → blob in cache, all surfaces updated

    // Update local record with new storage path
    this.image.update((prev) =>
      prev ? { ...prev, storage_path: event.newStoragePath, thumbnail_path: null } : prev,
    );

    this.fullResPreloaded.set(false);
    this.activeJobId.set(null);

    // Invalidate blob cache → re-sign from new storage path
    this.photoLoad.invalidate(event.imageId);

    const img = this.image();
    if (img?.storage_path) {
      await this.loadSignedUrls(img, this.abortController?.signal ?? new AbortController().signal);
    }

    // Free blob URL memory (no-op if no blob was provided)
    if (event.localObjectUrl) {
      URL.revokeObjectURL(event.localObjectUrl);
    }

    this.updateGridCache(event.imageId, event.newStoragePath);
    this.toastService.show({ message: 'Photo replaced', type: 'success' });
  }

  private async handleImageAttached(event: ImageAttachedEvent): Promise<void> {
    // UploadManagerService already called photoLoad.setLocalUrl → blob in cache, all surfaces updated

    // Update local record — now has a photo (switches from upload prompt to photo display)
    this.image.update((prev) =>
      prev ? { ...prev, storage_path: event.newStoragePath, thumbnail_path: null } : prev,
    );

    this.fullResPreloaded.set(false);
    this.activeJobId.set(null);

    // Invalidate blob cache → re-sign from new storage path
    this.photoLoad.invalidate(event.imageId);

    const img = this.image();
    if (img?.storage_path) {
      await this.loadSignedUrls(img, this.abortController?.signal ?? new AbortController().signal);
    }

    // Free blob URL memory
    if (event.localObjectUrl) {
      URL.revokeObjectURL(event.localObjectUrl);
    }

    this.updateGridCache(event.imageId, event.newStoragePath);
    this.toastService.show({ message: 'Photo attached', type: 'success' });
  }

  private updateGridCache(imageId: string, newStoragePath: string): void {
    this.workspaceView.rawImages.update((all) =>
      all.map((wi) =>
        wi.id === imageId
          ? {
              ...wi,
              storagePath: newStoragePath,
              thumbnailPath: null,
              signedThumbnailUrl: undefined,
              thumbnailUnavailable: false,
            }
          : wi,
      ),
    );
    const updated = this.workspaceView.rawImages().filter((wi) => wi.id === imageId);
    if (updated.length > 0) {
      void this.workspaceView.batchSignThumbnails(updated);
    }
  }
}
